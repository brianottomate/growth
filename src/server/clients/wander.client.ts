import "server-only";

import { env } from "@/env";

/**
 * WanderOS SaaS API — pregen site prospects.
 *
 * Growth is the prospecting system-of-record; WanderOS owns the site build. This
 * client covers the admin-only `/internal/prospects` surface added in
 * wandercom/wander#20939, which mints an org-less draft SaasWebsite and runs the
 * site-editor onboarding headlessly against the prospect's existing website.
 *
 * Dormant until configured. Every call throws a plain error when the base URL or
 * key is missing rather than pretending to work, so wiring this up before the
 * WanderOS side ships cannot silently no-op in production.
 *
 * The route authenticates `api-key-or-wander-os` and additionally requires
 * `manage` on the Wander organization, so `WANDER_API_KEY` must be a service key
 * carrying that scope — a narrower key authenticates and then 403s.
 */

export const isWanderApiConfigured =
  !!env.WANDER_API_URL && !!env.WANDER_API_KEY;

/** Brand-kit tone accepted by the prospect pipeline; "existing" mirrors their site. */
export type ProspectTone = "existing" | "professional" | "friendly" | "luxury";

/**
 * WanderOS's prospect lifecycle. Stored verbatim rather than remapped.
 *
 *   GENERATING → READY → CLAIMED
 *              ↘ FAILED
 *
 * GENERATING is where a prospect sits for the entire build — minutes, not
 * moments — so it is the status most rows will be in at any given time, not an
 * edge case.
 *
 * CLAIMED is the one that matters commercially: the prospect signed up and took
 * ownership of the pre-generated site. That is the conversion this whole motion
 * exists to produce, not merely a build finishing.
 *
 * Two enum values are deliberately absent. PENDING is the schema default but
 * create writes GENERATING directly, so no prospect is ever observably PENDING.
 * EXPIRED is never written — preview expiry was removed on the grounds that a
 * link dying mid-conversation costs more than a stale one. Both are dead values
 * on the WanderOS side; handling them here would be handling for nothing.
 */
export const PROSPECT_STATUSES = [
  "GENERATING",
  "READY",
  "CLAIMED",
  "FAILED",
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

/** Statuses where the build has stopped moving on its own. */
export const SETTLED_PROSPECT_STATUSES: readonly ProspectStatus[] = [
  "READY",
  "CLAIMED",
  "FAILED",
];

export interface CreateProspectInput {
  businessName: string;
  /** The prospect's current PM website — the source the onboarding crawls. */
  sourceUrl: string;
  email?: string;
  tone?: ProspectTone;
}

export interface WanderProspect {
  id: string;
  websiteId: string | null;
  businessName: string | null;
  email: string | null;
  sourceUrl: string | null;
  status: ProspectStatus;
  previewToken?: string | null;
  previewUrl?: string | null;
  errorMessage?: string | null;
}

const TIMEOUT_MS = 20_000;

async function wanderFetch<T>(
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown },
): Promise<T> {
  if (!isWanderApiConfigured) {
    throw new Error(
      "The WanderOS API is not configured. Set WANDER_API_URL and WANDER_API_KEY.",
    );
  }

  const response = await fetch(`${env.WANDER_API_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.WANDER_API_KEY!,
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    // Surface the body: the route returns a typed error for the two failures
    // worth acting on — an unscoped key (403) and a source URL it cannot crawl.
    const detail = await response.text().catch(() => "");
    throw new Error(
      `WanderOS ${init?.method ?? "GET"} ${path} failed: ${response.status}${
        detail ? ` — ${detail.slice(0, 400)}` : ""
      }`,
    );
  }

  return (await response.json()) as T;
}

/**
 * Ask WanderOS to build a pregen site for one prospect.
 *
 * Returns as soon as the prospect record exists — the build itself is async and
 * reports back over the prospect webhook. Treat the returned `status` as
 * "accepted", never as "built".
 */
export function createWebsiteProspect(
  input: CreateProspectInput,
): Promise<WanderProspect> {
  return wanderFetch<WanderProspect>("/internal/prospects", {
    method: "POST",
    body: {
      businessName: input.businessName,
      sourceUrl: input.sourceUrl,
      ...(input.email ? { email: input.email } : {}),
      tone: input.tone ?? "existing",
    },
  });
}

/**
 * Current state for prospects WanderOS holds.
 *
 * POST with a body rather than a GET with query params. `take` caps at 100 and
 * defaults to 20 on their side, so it is always passed explicitly here — an
 * omitted `take` is a page of 20, not everything.
 *
 * This is also the repair path. Delivery of the webhook is best-effort by
 * agreement on both sides, so anything that surfaces a prospect should be able
 * to re-read it from here rather than assuming the last event arrived.
 */
export function listWebsiteProspects(
  input: { skip?: number; take?: number; status?: ProspectStatus } = {},
): Promise<{ prospects: WanderProspect[]; total: number }> {
  return wanderFetch<{ prospects: WanderProspect[]; total: number }>(
    "/internal/prospects/list",
    {
      method: "POST",
      body: {
        skip: input.skip ?? 0,
        take: input.take ?? 100,
        ...(input.status ? { status: input.status } : {}),
      },
    },
  );
}

/**
 * Re-run a FAILED build. WanderOS keeps the same prospect id, wipes the failed
 * run's pages and recreates them, so our stored prospectId stays valid.
 */
export function retryWebsiteProspect(
  prospectId: string,
): Promise<WanderProspect> {
  return wanderFetch<WanderProspect>("/internal/prospects/retry", {
    method: "POST",
    body: { prospectId },
  });
}

export type GuestEmailOptOut = {
  websiteId: string;
  email: string;
  source: string;
  createdAt: string;
};

/**
 * Every guest who unsubscribed from one WanderOS website's marketing email.
 * One call covers almost every brand; larger lists take further pages. The
 * route (wandercom/wander#22237) answers an unknown org or website with a
 * 404, so a wrong id fails here instead of reading as "nobody unsubscribed".
 */
export async function listGuestEmailOptOuts(input: {
  organizationId: string;
  websiteId: string;
}) {
  const take = 10_000;
  const emails = new Set<string>();
  for (let skip = 0; ; skip += take) {
    const page: { optOuts: GuestEmailOptOut[]; total: number } =
      await wanderFetch("/internal/guest-opt-outs/list", {
        method: "POST",
        body: { ...input, skip, take },
      });
    for (const row of page.optOuts) emails.add(row.email.trim().toLowerCase());
    if (page.optOuts.length < take || skip + take >= page.total) return emails;
  }
}
