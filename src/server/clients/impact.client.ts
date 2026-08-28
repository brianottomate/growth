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
    const data = await impactFetch<Record<string, unknown>>(
      nextPath,
      nextParams,
    );
    const rows = data[arrayKey];
    if (Array.isArray(rows))
      all.push(...(rows as Array<Record<string, unknown>>));
    const nextUri = data["@nextpageuri"];
    if (typeof nextUri !== "string" || nextUri.length === 0) break;
    nextPath = nextUri;
    nextParams = {}; // the next-page URI already carries the full query string
  }
  return all;
}

// ---- Actions -------------------------------------------------------------

/** Live-verified per-action fields (List Actions); `raw` keeps everything else. */
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
  // Fraud-lens fields (all present on the live account's actions)
  ReferringDomain?: string;
  ReferringType?: string;
  IpAddress?: string;
  PromoCode?: string;
  Oid?: string; // order id — the corrections join key
  CustomerStatus?: string; // e.g. New vs Returning
  CustomerCountry?: string;
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
  platformCampaignId: string;
  actionDateStart: Date;
  actionDateEnd: Date;
  state?: "PENDING" | "APPROVED" | "REVERSED";
}): Promise<ImpactAction[]> {
  const actions = await impactFetchAllPages(
    "/Actions",
    {
      CampaignId: input.platformCampaignId,
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
    ReferringDomain: a.ReferringDomain as string | undefined,
    ReferringType: a.ReferringType as string | undefined,
    IpAddress: a.IpAddress as string | undefined,
    PromoCode: a.PromoCode as string | undefined,
    Oid: a.Oid as string | undefined,
    CustomerStatus: a.CustomerStatus as string | undefined,
    CustomerCountry: a.CustomerCountry as string | undefined,
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

// ---- Performance by Day (report) -------------------------------------------

/** One "Performance by Day" report row, coerced to numbers. */
export interface ImpactDayPerformance {
  date: string; // YYYY-MM-DD
  clicks: number;
  actions: number;
  revenue: number;
}

const MONTH_NUM: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

/** The report's date_sort field comes back empty — parse "Aug 12, 2026". */
function parseDisplayDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/.exec(v.trim());
  if (!m) return null;
  const month = MONTH_NUM[m[1]!];
  if (!month) return null;
  return `${m[3]}-${month}-${m[2]!.padStart(2, "0")}`;
}

/**
 * Daily clicks/actions/revenue from the account's "Performance by Day" report
 * (att_adv_performance_by_day_pm_only, live-verified 2026-08-12). SUBAID scopes
 * it to one program — without it every value comes back as an empty string.
 * Both dates are inclusive calendar days; rows arrive newest-first, one per
 * day. Clicks are the tracking-liveness signal the Actions list can't provide
 * (~40–65/day on the live program vs ~1 action/day).
 */
export async function listPerformanceByDay(input: {
  platformCampaignId: string;
  startDay: string; // YYYY-MM-DD
  endDay: string;
}): Promise<ImpactDayPerformance[]> {
  const data = await impactFetch<Record<string, unknown>>(
    "/Reports/att_adv_performance_by_day_pm_only.json",
    {
      START_DATE: input.startDay,
      END_DATE: input.endDay,
      SUBAID: input.platformCampaignId,
    },
  );
  const rows = Array.isArray(data.Records)
    ? (data.Records as Array<Record<string, unknown>>)
    : [];
  const days: ImpactDayPerformance[] = [];
  for (const r of rows) {
    const date = parseDisplayDate(r.date_display);
    if (!date) continue;
    days.push({
      date,
      clicks: num(r.Clicks),
      actions: num(r.Actions),
      revenue: num(r.Revenue),
    });
  }
  return days.sort((a, b) => b.date.localeCompare(a.date));
}

// ---- Campaigns (programs) ---------------------------------------------------

export interface ImpactCampaign {
  Id: string;
  Name?: string;
  State?: string;
  Type?: string; // Performance | Creator
  raw: Record<string, unknown>;
}

/** All programs on the account (incl. historical — watch for the old 17030). */
export async function listCampaigns(): Promise<ImpactCampaign[]> {
  const campaigns = await impactFetchAllPages("/Campaigns", {}, "Campaigns");
  return campaigns.map((c) => ({
    Id: str(c.Id),
    Name: c.Name as string | undefined,
    State: c.State as string | undefined,
    Type: c.Type as string | undefined,
    raw: c,
  }));
}

// ---- Action inquiries (partner disputes) -------------------------------------

/**
 * Formal partner disputes over attribution/payout. Field shape is only loosely
 * documented — parse defensively, keep everything in raw. CampaignId required.
 */
export interface ImpactActionInquiry {
  Id: string;
  Status?: string;
  raw: Record<string, unknown>;
}

export async function listActionInquiries(
  platformCampaignId: string,
): Promise<ImpactActionInquiry[]> {
  const inquiries = await impactFetchAllPages(
    "/ActionInquiries",
    { CampaignId: platformCampaignId },
    "ActionInquiries",
  );
  return inquiries.map((i) => ({
    Id: str(i.Id ?? i.InquiryId),
    Status: (i.Status ?? i.State) as string | undefined,
    raw: i,
  }));
}

// ---- Invoices (partner payout obligations) ------------------------------------

export interface ImpactInvoiceLineItem {
  Status?: string; // PAID | PENDING | OVERDUE (all three live on the account)
  DueDate?: string;
  TotalItemAmount?: string;
  CampaignName?: string;
  raw: Record<string, unknown>;
}

export interface ImpactInvoice {
  Id: string;
  CreatedDate?: string;
  MediaName?: string; // the partner being paid
  TotalAmount?: string;
  LineItems: ImpactInvoiceLineItem[];
  raw: Record<string, unknown>;
}

/** Partner payout invoices — the funding/payment-health view (no balance API). */
export async function listInvoices(): Promise<ImpactInvoice[]> {
  const invoices = await impactFetchAllPages("/Invoices", {}, "Invoices");
  return invoices.map((i) => ({
    Id: str(i.Id),
    CreatedDate: i.CreatedDate as string | undefined,
    MediaName: i.MediaName as string | undefined,
    TotalAmount: i.TotalAmount as string | undefined,
    LineItems: (Array.isArray(i.LineItems)
      ? (i.LineItems as Array<Record<string, unknown>>)
      : []
    ).map((l) => ({
      Status: l.Status as string | undefined,
      DueDate: l.DueDate as string | undefined,
      TotalItemAmount: l.TotalItemAmount as string | undefined,
      CampaignName: l.CampaignName as string | undefined,
      raw: l,
    })),
    raw: i,
  }));
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
  platformCampaignId?: string;
  state?: string;
}): Promise<ImpactPartner[]> {
  const partners = await impactFetchAllPages(
    "/MediaPartners",
    { CampaignId: input?.platformCampaignId, State: input?.state },
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
