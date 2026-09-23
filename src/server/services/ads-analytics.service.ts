import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import {
  getZernioAdsTree,
  type ZernioAd,
  type ZernioAdsTreeCampaign,
} from "@/server/clients/zernio.client";
import {
  filterToAllowedAdAccounts,
  getAllowedAdAccountIds,
} from "@/server/services/ad-account-allowlist.service";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";

/**
 * Ad-performance analytics over the Zernio ad tree — the shared logic behind
 * both the /overview chat capabilities (adsScope / topAds) and the `ads` oRPC
 * router that powers the interactive cards. Single source of truth so the chat
 * answer and the in-place refetch can never drift.
 *
 * Why this exists: the Zernio sync only persists campaign-level rolled-up stats;
 * per-ad metrics + creative copy + destination links live only in the Zernio
 * API (and default to the last 90 days). This layer pulls a real window, ranks
 * creatives by Meta platform metrics, and buckets by destination + objective.
 *
 * Endpoint choice, evaluated 2026-07-10: /ads/tree is the ONLY Zernio endpoint
 * with per-ad creative + metrics (timeline is connection-level daily aggregates
 * with a broken scope filter; /analytics is organic posts), so it stays despite
 * its cost — a full 365-730d fetch is 3 pages / ~6MB / ~15s, absorbed by the
 * 10-min unstable_cache. Its metrics are WINDOW TOTALS (right for creative
 * ranking; the spend tracker needs daily series and uses the Meta API directly
 * instead). ~54% of returned campaigns are dead $0 X drafts — no platform
 * filter exists to skip them. Revisit if Zernio adds account/platform params.
 *
 * Reference oracle: scripts/zernio-ads-perf-scan.ts (same numbers, same window).
 */

export const ZERNIO_ADS_CACHE_TAG = "zernio-ads";
const CACHE_TTL_SECONDS = 600;

// CTR ranking needs a delivery floor or low-impression flukes dominate.
const MIN_IMPRESSIONS_FOR_CTR = 5000;
const DEFAULT_WINDOW_DAYS = 365;

export type AdsMetric =
  | "impressions"
  | "clicks"
  | "ctr"
  | "engagement"
  | "spend";

export type AdsStatusFilter = "all" | "active" | "non-paused";

export const AD_DESTINATIONS = [
  "audit",
  "os",
  "list",
  "marketplace",
  "other-link",
  "lead-form",
  "engagement",
  "unknown",
] as const;
export type AdDestination = (typeof AD_DESTINATIONS)[number];

// ---- WINDOW ----------------------------------------------------------------

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve a concrete YYYY-MM-DD window (default = last 365 days). Computed by
 * the caller (capability / router), NOT inside the cache, so the cache key is a
 * stable explicit window per day.
 */
export function resolveAdsWindow(input: {
  fromDate?: string;
  toDate?: string;
}): { fromDate: string; toDate: string } {
  const toDate = input.toDate ?? ymd(new Date());
  const fromDate =
    input.fromDate ??
    ymd(new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000));
  return { fromDate, toDate };
}

// ---- CACHED FETCH ----------------------------------------------------------

const fetchTreeCached = unstable_cache(
  async (fromDate: string, toDate: string): Promise<ZernioAdsTreeCampaign[]> =>
    getZernioAdsTree({ fromDate, toDate }),
  ["zernio-ads-tree-v1"],
  { revalidate: CACHE_TTL_SECONDS, tags: [ZERNIO_ADS_CACHE_TAG] },
);

/**
 * Tree fetch + ad-account allowlist (default-deny). The Zernio metaads
 * connection was OAuth'd via a personal Facebook login and enumerates foreign
 * ad accounts (e.g. "Homi"); Zernio's own scope filter doesn't hold on
 * /ads/tree — so every consumer goes through this guard, not fetchTreeCached
 * directly. Campaigns carry platformAdAccountId; the allowlist lives in Neon
 * `ad_account` (scripts/seed-ad-accounts.ts).
 */
async function fetchAllowedTree(
  fromDate: string,
  toDate: string,
  brandId: string,
): Promise<ZernioAdsTreeCampaign[]> {
  const [tree, allowed] = await Promise.all([
    fetchTreeCached(fromDate, toDate),
    getAllowedAdAccountIds(brandId),
  ]);
  return filterToAllowedAdAccounts(
    tree,
    allowed,
    "zernio-ads-tree-brand-scope",
    false,
  );
}

async function resolveOwnedAdBrand(input: {
  organizationId: string;
  brandSlug: string;
}) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.organizationId, input.organizationId),
      eq(brandTable.slug, input.brandSlug),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, slug: true, name: true },
  });
  if (!brand?.slug)
    throw new Error(`Owned brand not found: ${input.brandSlug}`);
  return { ...brand, slug: brand.slug };
}

// ---- FLATTEN + CLASSIFY ----------------------------------------------------

type FlatAd = {
  id: string;
  name?: string;
  status?: string;
  objective: string;
  campaignName?: string;
  destination: AdDestination;
  link?: string;
  thumbnailUrl?: string;
  createdAt?: string;
  body: string;
  impressions: number;
  clicks: number;
  engagement: number;
  spend: number;
  conversions: number;
  ctr: number; // recomputed clicks/impressions (0..1)
};

/** linkUrl + objective → destination bucket (lifted from the scan script). */
export function classifyDestination(ad: ZernioAd): AdDestination {
  const link = (ad.creative?.linkUrl ?? "").toLowerCase();
  if (link.includes("audit.wander.com") || link.includes("/audit"))
    return "audit";
  if (link.includes("/os") || link.includes("wanderos")) return "os";
  if (link.includes("/list")) return "list";
  if (link.includes("wander.com")) return "marketplace";
  if (link) return "other-link";
  // No link surfaced (dynamic catalog / video) — infer from objective.
  if (ad.platformObjective === "OUTCOME_LEADS") return "lead-form";
  if (
    ad.platformObjective === "OUTCOME_ENGAGEMENT" ||
    ad.platformObjective === "POST_ENGAGEMENT"
  )
    return "engagement";
  return "unknown";
}

function flattenWindowedAds(tree: ZernioAdsTreeCampaign[]): FlatAd[] {
  const out: FlatAd[] = [];
  for (const c of tree) {
    for (const s of c.adSets ?? []) {
      for (const a of s.ads ?? []) {
        const id = a._id ?? a.id ?? a.platformAdId;
        if (typeof id !== "string" || id.length === 0) continue;
        const m = a.metrics ?? {};
        const impressions = m.impressions ?? 0;
        const clicks = m.clicks ?? 0;
        out.push({
          id,
          name: a.name,
          status: a.status,
          objective: a.platformObjective ?? "(none)",
          campaignName:
            typeof c.campaignName === "string" ? c.campaignName : c.name,
          destination: classifyDestination(a),
          link: a.creative?.linkUrl ?? undefined,
          thumbnailUrl: a.creative?.thumbnailUrl ?? undefined,
          createdAt: a.platformCreatedAt ?? a.createdAt,
          body: (a.creative?.body ?? "").replace(/\s+/g, " ").trim(),
          impressions,
          clicks,
          engagement: m.engagement ?? 0,
          spend: m.spend ?? 0,
          conversions: m.conversions ?? 0,
          ctr: impressions > 0 ? clicks / impressions : 0,
        });
      }
    }
  }
  return out;
}

function passesStatus(ad: FlatAd, filter: AdsStatusFilter): boolean {
  const s = (ad.status ?? "").toLowerCase();
  if (filter === "active") return s === "active";
  if (filter === "non-paused") return s !== "paused";
  return true;
}

// ---- AGGREGATE (scope) -----------------------------------------------------

type Bucket = {
  key: string;
  ads: number;
  impressions: number;
  clicks: number;
  engagement: number;
  spend: number;
  ctr: number;
};

function bucketBy(ads: FlatAd[], keyFn: (a: FlatAd) => string): Bucket[] {
  const map = new Map<string, Omit<Bucket, "ctr">>();
  for (const a of ads) {
    const k = keyFn(a);
    const e = map.get(k) ?? {
      key: k,
      ads: 0,
      impressions: 0,
      clicks: 0,
      engagement: 0,
      spend: 0,
    };
    e.ads++;
    e.impressions += a.impressions;
    e.clicks += a.clicks;
    e.engagement += a.engagement;
    e.spend += a.spend;
    map.set(k, e);
  }
  return [...map.values()]
    .map((e) => ({ ...e, ctr: e.impressions ? e.clicks / e.impressions : 0 }))
    .sort((a, b) => b.impressions - a.impressions);
}

export type AdsScopeResult = {
  brand: { id: string; slug: string; name: string };
  window: { fromDate: string; toDate: string };
  account: { id?: string; name?: string };
  totals: {
    ads: number; // delivered (impressions > 0)
    allAds: number;
    impressions: number;
    clicks: number;
    ctr: number;
    spend: number;
    engagement: number;
    conversions: number;
  };
  byMonth: {
    month: string;
    ads: number;
    impressions: number;
    clicks: number;
    spend: number;
  }[];
  byObjective: Bucket[];
  byDestination: Bucket[];
  flags: { hasAuditAds: boolean; hasOsAds: boolean };
};

export async function computeAdsScope(input: {
  organizationId: string;
  brandSlug: string;
  fromDate?: string;
  toDate?: string;
}): Promise<AdsScopeResult> {
  const window = resolveAdsWindow(input);
  const brand = await resolveOwnedAdBrand(input);
  const tree = await fetchAllowedTree(window.fromDate, window.toDate, brand.id);
  const all = flattenWindowedAds(tree);
  const delivered = all.filter((a) => a.impressions > 0);

  const first = (tree[0] ?? {}) as Record<string, unknown>;
  const account = {
    id:
      typeof first.platformAdAccountId === "string"
        ? first.platformAdAccountId
        : undefined,
    name:
      typeof first.platformAdAccountName === "string"
        ? first.platformAdAccountName
        : undefined,
  };

  const sum = (f: (a: FlatAd) => number) =>
    delivered.reduce((n, a) => n + f(a), 0);
  const impressions = sum((a) => a.impressions);
  const clicks = sum((a) => a.clicks);

  // Bucket delivered ads by launch month (platformCreatedAt) — a spend-over-time proxy.
  const monthMap = new Map<
    string,
    {
      month: string;
      ads: number;
      impressions: number;
      clicks: number;
      spend: number;
    }
  >();
  for (const a of delivered) {
    if (!a.createdAt) continue;
    const month = a.createdAt.slice(0, 7);
    const e = monthMap.get(month) ?? {
      month,
      ads: 0,
      impressions: 0,
      clicks: 0,
      spend: 0,
    };
    e.ads++;
    e.impressions += a.impressions;
    e.clicks += a.clicks;
    e.spend += a.spend;
    monthMap.set(month, e);
  }

  return {
    brand,
    window,
    account,
    totals: {
      ads: delivered.length,
      allAds: all.length,
      impressions,
      clicks,
      ctr: impressions ? clicks / impressions : 0,
      spend: sum((a) => a.spend),
      engagement: sum((a) => a.engagement),
      conversions: sum((a) => a.conversions),
    },
    byMonth: [...monthMap.values()].sort((a, b) =>
      a.month.localeCompare(b.month),
    ),
    byObjective: bucketBy(delivered, (a) => a.objective),
    byDestination: bucketBy(delivered, (a) => a.destination),
    flags: {
      hasAuditAds: all.some((a) => a.destination === "audit"),
      hasOsAds: delivered.some((a) => a.destination === "os"),
    },
  };
}

// ---- RANK (topAds) ---------------------------------------------------------

export type RankedAd = {
  id: string;
  name: string | null;
  campaign: string | null;
  objective: string;
  destination: AdDestination;
  status: string | null;
  link: string | null;
  thumbnailUrl: string | null;
  created: string | null;
  impressions: number;
  clicks: number;
  ctr: number; // percent, 2dp
  engagement: number;
  spend: number; // rounded
  conversions: number;
  cpc: number; // 2dp
  body: string;
};

export type TopAdsResult = {
  brand: { id: string; slug: string; name: string };
  window: { fromDate: string; toDate: string };
  filters: {
    objective?: string;
    destination?: AdDestination;
    status: AdsStatusFilter;
    metric: AdsMetric;
    limit: number;
  };
  matched: number;
  ads: RankedAd[];
};

const metricValue = (a: FlatAd, metric: AdsMetric): number =>
  metric === "ctr" ? a.ctr : a[metric];

export async function computeTopAds(input: {
  organizationId: string;
  brandSlug: string;
  fromDate?: string;
  toDate?: string;
  objective?: string;
  destination?: AdDestination;
  status?: AdsStatusFilter;
  metric?: AdsMetric;
  limit?: number;
}): Promise<TopAdsResult> {
  const window = resolveAdsWindow(input);
  const status = input.status ?? "all";
  const metric = input.metric ?? "impressions";
  const limit = Math.min(Math.max(input.limit ?? 15, 1), 30);

  const brand = await resolveOwnedAdBrand(input);
  const tree = await fetchAllowedTree(window.fromDate, window.toDate, brand.id);
  let ads = flattenWindowedAds(tree).filter((a) => a.impressions > 0);
  ads = ads.filter((a) => passesStatus(a, status));
  if (input.objective) ads = ads.filter((a) => a.objective === input.objective);
  if (input.destination)
    ads = ads.filter((a) => a.destination === input.destination);

  // CTR ranking applies a delivery floor so low-impression flukes don't win.
  const ranked = ads
    .filter((a) =>
      metric === "ctr" ? a.impressions >= MIN_IMPRESSIONS_FOR_CTR : true,
    )
    .sort((a, b) => metricValue(b, metric) - metricValue(a, metric));

  const top: RankedAd[] = ranked.slice(0, limit).map((a) => ({
    id: a.id,
    name: a.name ?? null,
    campaign: a.campaignName ?? null,
    objective: a.objective,
    destination: a.destination,
    status: a.status ?? null,
    link: a.link ?? null,
    thumbnailUrl: a.thumbnailUrl ?? null,
    created: a.createdAt ? a.createdAt.slice(0, 10) : null,
    impressions: a.impressions,
    clicks: a.clicks,
    ctr: Number((a.ctr * 100).toFixed(2)),
    engagement: a.engagement,
    spend: Math.round(a.spend),
    conversions: a.conversions,
    cpc: a.clicks ? Number((a.spend / a.clicks).toFixed(2)) : 0,
    body: a.body.slice(0, 280),
  }));

  return {
    brand,
    window,
    filters: {
      objective: input.objective,
      destination: input.destination,
      status,
      metric,
      limit,
    },
    matched: ranked.length,
    ads: top,
  };
}
