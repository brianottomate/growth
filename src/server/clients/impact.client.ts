import "server-only";

import { env } from "@/env";

// Impact.com Brand (Advertiser) API — the affiliate network Wander's program
// runs on (docs/affiliate-program-takeover.md). Thin read-first client; write
// endpoints (Update/Reverse Actions) arrive with the corrections workflow.
//
// Auth is HTTP basic: AccountSID as username, AuthToken as password (created in
// the Impact dashboard → Settings → API Access). Docs:
// https://integrations.impact.com/brand-api-reference
//
// NOTE: untested against the live account until credentials land (Phase 0 of
// the takeover plan). Parsing is deliberately defensive and every helper logs
// the raw failure so the first real run tells us exactly what to adjust.

const IMPACT_BASE_URL = "https://api.impact.com";

export function isImpactConfigured(): boolean {
  return Boolean(env.IMPACT_ACCOUNT_SID && env.IMPACT_AUTH_TOKEN);
}

async function impactFetch<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const sid = env.IMPACT_ACCOUNT_SID;
  const token = env.IMPACT_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Impact API not configured");

  // Pagination hands back absolute paths ("/Advertisers/…?Page=2"); first
  // calls pass a resource path relative to the account root.
  const url = new URL(
    path.startsWith("/Advertisers")
      ? `${IMPACT_BASE_URL}${path}`
      : `${IMPACT_BASE_URL}/Advertisers/${sid}${path}`,
  );
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(
      `Impact API ${res.status} ${res.statusText} on ${path}: ${body.slice(0, 300)}`,
    );
  }
  // The API defaults to XML in some setups — if the Accept header didn't take,
  // surface it loudly instead of failing on JSON.parse with a cryptic error.
  if (body.trimStart().startsWith("<")) {
    throw new Error(
      `Impact API returned XML for ${path} — retry with a .json path suffix (body: ${body.slice(0, 120)}…)`,
    );
  }
  return JSON.parse(body) as T;
}

/**
 * Fetch every page of a list endpoint. Impact paginates with root-level
 * metadata ("@page", "@numpages", "@nextpageuri" — empty string on the last
 * page); MediaPartners defaults to 100/page (1,350 partners = 14 pages),
 * Actions to 20,000/page. Hard-capped at 100 pages as a runaway guard.
 */
async function impactFetchAllPages(
  path: string,
  params: Record<string, string | number | undefined>,
  arrayKey: string,
): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  let nextPath = path;
  let nextParams = params;
  for (let page = 0; page < 100; page++) {
    const data = await impactFetch<Record<string, unknown>>(nextPath, nextParams);
    const rows = data[arrayKey];
    if (Array.isArray(rows)) all.push(...(rows as Array<Record<string, unknown>>));
    const nextUri = data["@nextpageuri"];
    if (typeof nextUri !== "string" || nextUri.length === 0) break;
    nextPath = nextUri;
    nextParams = {}; // the next-page URI already carries the full query string
  }
  return all;
}

// ---- Actions -------------------------------------------------------------

/** Documented per-action fields (List Actions); `raw` keeps everything else. */
export interface ImpactAction {
  Id: string;
  State: string; // PENDING | APPROVED | REVERSED
  CampaignId?: number | string;
  ActionTrackerId?: number | string;
  ActionTrackerName?: string;
  MediaPartnerId?: number | string;
  MediaPartnerName?: string;
  Payout?: number | string;
  Amount?: number | string;
  EventDate?: string;
  CreationDate?: string;
  LockingDate?: string;
  raw: Record<string, unknown>;
}

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** Coerce an id-ish field (string | number in practice) to a string safely. */
function str(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

/** Impact rejects fractional seconds — "2026-07-08T00:00:00Z", never ".000Z". */
function isoNoMillis(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * List actions for a program (Impact "campaign") filtered by EventDate window.
 * Dates are ISO 8601 with time; the window may not exceed 45 days.
 */
export async function listActions(input: {
  campaignId: string;
  actionDateStart: Date;
  actionDateEnd: Date;
  state?: "PENDING" | "APPROVED" | "REVERSED";
}): Promise<ImpactAction[]> {
  const actions = await impactFetchAllPages(
    "/Actions",
    {
      CampaignId: input.campaignId,
      ActionDateStart: isoNoMillis(input.actionDateStart),
      ActionDateEnd: isoNoMillis(input.actionDateEnd),
      State: input.state,
    },
    "Actions",
  );
  return actions.map((a) => ({
    Id: str(a.Id),
    State: str(a.State),
    CampaignId: a.CampaignId as string | number | undefined,
    ActionTrackerId: a.ActionTrackerId as string | number | undefined,
    ActionTrackerName: a.ActionTrackerName as string | undefined,
    MediaPartnerId: a.MediaPartnerId as string | number | undefined,
    MediaPartnerName: a.MediaPartnerName as string | undefined,
    Payout: a.Payout as number | string | undefined,
    Amount: a.Amount as number | string | undefined,
    EventDate: a.EventDate as string | undefined,
    CreationDate: a.CreationDate as string | undefined,
    LockingDate: a.LockingDate as string | undefined,
    raw: a,
  }));
}

/** Sum payout/amount defensively (the API sometimes stringifies numbers). */
export function aggregateActions(actions: ImpactAction[]): {
  count: number;
  revenue: number;
  commission: number;
} {
  return {
    count: actions.length,
    revenue: actions.reduce((s, a) => s + num(a.Amount), 0),
    commission: actions.reduce((s, a) => s + num(a.Payout), 0),
  };
}

// ---- Partners (MediaPartners) ---------------------------------------------

export interface ImpactPartner {
  Id: string;
  Name?: string;
  State?: string; // ACTIVE | PENDING | DECLINED | …
  Website?: string;
  PartnerType?: string;
  DateCreated?: string;
  DateLastUpdated?: string;
  raw: Record<string, unknown>;
}

/** List partners, optionally scoped to a program and/or network state. */
export async function listMediaPartners(input?: {
  campaignId?: string;
  state?: string;
}): Promise<ImpactPartner[]> {
  const partners = await impactFetchAllPages(
    "/MediaPartners",
    { CampaignId: input?.campaignId, State: input?.state },
    "Partners",
  );
  return partners.map((p) => ({
    Id: str(p.Id),
    Name: p.Name as string | undefined,
    State: p.State as string | undefined,
    Website: p.Website as string | undefined,
    PartnerType: p.PartnerType as string | undefined,
    DateCreated: p.DateCreated as string | undefined,
    DateLastUpdated: p.DateLastUpdated as string | undefined,
    raw: p,
  }));
}
