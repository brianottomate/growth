import "server-only";

import { and, eq, inArray, isNotNull, ne, notInArray } from "drizzle-orm";

import { adPlatformFromZernioString, adPlatformSpec } from "@/lib/ad-platforms";
import { db } from "@/server/db";
import {
  platformAdSetTable,
  platformAdTable,
  type AdStats,
  platformCampaignTable,
  type PlatformCampaignStatus,
} from "@/server/db/ads-schema";
import { brandTable } from "@/server/db/brand-schema";
import { type ChannelPlatform, channelTable } from "@/server/db/channel-schema";
import { getAllowedAdAccountIds } from "@/server/services/ad-account-allowlist.service";
import { recomputeAllPerformanceCycleSpend } from "@/server/services/performance.service";
import {
  getZernioAdsTree,
  isZernioConfigured,
  mapZernioPlatform,
  type ZernioAd,
  type ZernioAdsTreeCampaign,
} from "@/server/clients/zernio.client";

// Campaigns whose latest creative predates this are pre-account-era junk
// (boosted organic posts, abandoned 2022 tests). See zernio-ads-validate.ts.
const MIN_CAMPAIGN_DATE = Date.parse("2024-01-01");

type CampaignInsert = typeof platformCampaignTable.$inferInsert;

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

// Zernio campaign status → our enum. The tree reports lowercase active/paused,
// and Meta also reports completed/archived/deleted once a schedule runs out.
// Those used to fall through to `draft`, which reads as "authored here, never
// pushed" — so a Meta campaign that ran and finished showed up as a draft.
function mapStatus(raw: unknown): PlatformCampaignStatus {
  switch (str(raw)?.toLowerCase()) {
    case "active":
      return "live";
    case "paused":
      return "paused";
    case "scheduled":
    case "pending":
      return "scheduled";
    case "completed":
    case "archived":
    case "deleted":
    // LinkedIn's terminal states alongside completed/archived.
    case "canceled":
    case "cancelled":
    // Google's terminal status. It has no "completed": a Google campaign whose
    // end date passed stays enabled, so only removal is terminal there.
    case "removed":
      return "ended";
    default:
      return "draft";
  }
}

function adDateMs(a: ZernioAd): number | undefined {
  const raw = a.platformCreatedAt ?? a.createdAt;
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(t) ? undefined : t;
}

// Pull a metrics snapshot (campaign-level if present, else rolled up from ads).
/** One entity's metrics object → AdStats, shared by campaign/set/ad levels. */
function statsFrom(metrics: unknown): AdStats | null {
  if (!metrics || typeof metrics !== "object") return null;
  const m = metrics as Record<string, unknown>;
  const stats: AdStats = {
    spend: num(m.spend),
    impressions: num(m.impressions),
    reach: num(m.reach),
    clicks: num(m.clicks),
    ctr: num(m.ctr),
    cpc: num(m.cpc),
    cpm: num(m.cpm),
    conversions: num(m.conversions),
    roas: num(m.roas),
    purchaseValue: num(m.purchaseValue),
    costPerConversion: num(m.costPerConversion),
  };
  return Object.values(stats).some((value) => value !== undefined)
    ? stats
    : null;
}

function buildStats(
  campaign: Record<string, unknown>,
  ads: ZernioAd[],
): AdStats {
  const own = statsFrom(campaign.metrics);
  if (own) return own;
  // Fallback: sum the spend across ads (other rates aren't meaningfully summable).
  let spend = 0;
  for (const a of ads) {
    spend += num(a.metrics?.spend) ?? 0;
  }
  return { spend };
}

// Top-spend ad's thumbnail; fall back to the most recent ad with one.
function pickHeroThumbnail(ads: ZernioAd[]): string | undefined {
  let best: { spend: number; thumb: string } | undefined;
  let fallback: { ms: number; thumb: string } | undefined;
  for (const a of ads) {
    const thumb = str(a.creative?.thumbnailUrl);
    if (!thumb) continue;
    const spend = num(a.metrics?.spend) ?? 0;
    if (!best || spend > best.spend) best = { spend, thumb };
    const ms = adDateMs(a) ?? 0;
    if (!fallback || ms > fallback.ms) fallback = { ms, thumb };
  }
  return best?.thumb ?? fallback?.thumb;
}

function flattenAds(c: ZernioAdsTreeCampaign): ZernioAd[] {
  const ads: ZernioAd[] = [];
  for (const s of c.adSets ?? []) for (const a of s.ads ?? []) ads.push(a);
  return ads;
}

// Platform-aware deep links come from the platform table.
function accountManageUrl(
  platform: ChannelPlatform,
  accountId: string | undefined,
): string | undefined {
  if (!accountId) return undefined;
  return adPlatformSpec(platform)?.accountManageUrl(accountId);
}

function campaignManageUrl(
  platform: ChannelPlatform,
  accountId: string | undefined,
  platformCampaignId: string | undefined,
): string | undefined {
  if (!accountId || !platformCampaignId) return undefined;
  return adPlatformSpec(platform)?.campaignManageUrl(
    accountId,
    platformCampaignId,
  );
}

// Zernio's tree mixes every connected ads platform in one list, and reports
// the campaign platform as the SOCIAL network name (facebook/twitter/google),
// not the connection name (metaads/xads/googleads). The platform table knows
// both spellings; anything else falls through to the social mapping.
function campaignPlatform(c: Record<string, unknown>): string {
  const raw = str(c.platform)?.toLowerCase();
  return adPlatformFromZernioString(raw) ?? mapZernioPlatform(raw);
}

/**
 * Pull one platform's ad campaigns from Zernio (`/ads/tree`) and upsert them
 * into `campaign` (one row per Zernio campaign, keyed on platformCampaignId).
 * Stores a latest metrics snapshot + one hero creative so feed/calendar can
 * render a card without touching `ad_spot`. Idempotent — safe to re-run;
 * updates metrics in place. `campaignId` stays null (authored by hand).
 *
 * The tree mixes every connected platform, so campaigns are filtered three
 * ways: by `platform`, by the default-deny ad-account allowlist, and — when
 * `adAccountId` is given (Google has Demand/Supply/Sites under one
 * connection) — down to that single account. The channel row is resolved per
 * (brand, platform[, externalId]) and its externalId is backfilled onto
 * placeholder rows.
 */
/**
 * Default ingest window. Zernio's tree returns every campaign an ad account
 * has ever had, and Wander's has hundreds of ended tests. Pulling all of them
 * buries the handful that matter and makes the attach picker unusable, so the
 * sync is bounded by default and widened deliberately.
 */
export const ADS_SYNC_DEFAULT_SINCE_DAYS = 120;

export type AdsSyncFilters = {
  /**
   * Only campaigns started (or, absent a start date, last updated) within this
   * many days. Pass null for no window — the old unbounded behaviour.
   */
  sinceDays?: number | null;
  /** Skip campaigns whose observed spend is below this many whole dollars. */
  minSpend?: number;
  /** Only these campaign statuses, lower-cased (e.g. ["active","paused"]). */
  statuses?: string[];
  /** Hard cap after filtering, newest first. */
  limit?: number;
};

/**
 * Whether the tree we just fetched was complete enough to conclude that a
 * campaign missing from it was deleted on the platform.
 *
 * Absence is only evidence of deletion when nothing could have hidden a live
 * campaign. Any ingest window (sinceDays, minSpend, statuses, limit), any
 * campaign the window dropped, and any error mid-sync all make absence
 * meaningless, so a partial sync reconciles nothing. Getting this wrong marks
 * a client's running campaigns as ended.
 *
 * `accountScoped` is the subtle one: a sync narrowed to a single ad account
 * sees none of the brand's other accounts, and channel resolution can put two
 * accounts on one channel row — so the reconcile query would sweep campaigns
 * this tree was never asked about.
 */
export function treeIsCompleteEnoughToReconcile(input: {
  filteredOut: number;
  errorCount: number;
  accountScoped: boolean;
  limit: number | null;
  sinceDays: number | null;
  minSpend: number | null;
  statuses: string[] | null;
}) {
  return (
    !input.accountScoped &&
    input.filteredOut === 0 &&
    input.errorCount === 0 &&
    input.limit === null &&
    input.sinceDays === null &&
    input.minSpend === null &&
    input.statuses === null
  );
}

/**
 * Mirror a synced campaign's ad sets and ads into real rows.
 *
 * Sync used to record `adSpots` as a bare count, so a pulled campaign showed
 * "0 ads" and no creative anywhere in the UI while claiming to have some. The
 * push already writes these rows; sync writing them too is what makes a
 * pulled campaign and a pushed one read the same.
 *
 * Keyed on the platform's own ids, so re-running updates in place.
 */
async function syncCampaignChildren(input: {
  brandId: string;
  channelId: string;
  platform: ChannelPlatform;
  tree: ZernioAdsTreeCampaign[];
  rowIdByExternalId: Map<string, string>;
}) {
  type PendingSet = {
    externalId: string;
    values: typeof platformAdSetTable.$inferInsert;
  };
  type PendingAd = {
    externalId: string;
    adSetExternalId: string | undefined;
    values: typeof platformAdTable.$inferInsert;
  };
  const sets: PendingSet[] = [];
  const ads: PendingAd[] = [];

  for (const campaign of input.tree) {
    const obj = campaign as Record<string, unknown>;
    const campaignExternalId =
      str(obj.platformCampaignId) ?? campaign.id ?? campaign._id;
    const rowId = campaignExternalId
      ? input.rowIdByExternalId.get(campaignExternalId)
      : undefined;
    if (!rowId) continue;

    for (const adSet of campaign.adSets ?? []) {
      const setObj = adSet as Record<string, unknown>;
      const setExternalId =
        str(setObj.platformAdSetId) ?? adSet.id ?? adSet._id;
      if (setExternalId) {
        sets.push({
          externalId: setExternalId,
          values: {
            brandId: input.brandId,
            platformCampaignId: rowId,
            name: adSet.name ?? setExternalId,
            status: adSet.status ?? null,
            budget:
              num(
                (setObj.budget as { amount?: unknown } | undefined)?.amount ??
                  setObj.budget,
              ) ?? null,
            budgetType:
              str((setObj.budget as { type?: unknown } | undefined)?.type) ??
              null,
            // Set-level metrics when the tree carries them; otherwise the
            // spend fallback below sums this set's ads.
            stats:
              statsFrom(setObj.metrics) ??
              (() => {
                let spend = 0;
                for (const ad of adSet.ads ?? []) {
                  spend += num(ad.metrics?.spend) ?? 0;
                }
                return spend > 0 ? { spend } : null;
              })(),
            externalId: setExternalId,
          },
        });
      }

      for (const ad of adSet.ads ?? []) {
        const adExternalId = ad.platformAdId ?? ad.id ?? ad._id;
        if (!adExternalId) continue;
        const creative = ad.creative ?? {};
        const image = creative.imageUrl ?? creative.videoUrl ?? null;
        const media = image
          ? [
              {
                url: image,
                type: creative.videoUrl
                  ? ("video" as const)
                  : ("image" as const),
              },
            ]
          : null;
        ads.push({
          externalId: adExternalId,
          adSetExternalId: setExternalId,
          values: {
            brandId: input.brandId,
            platformCampaignId: rowId,
            channelId: input.channelId,
            platform: input.platform,
            name: ad.name ?? adExternalId,
            status: ad.status ?? null,
            externalAdSetId: ad.platformAdSetId ?? setExternalId ?? null,
            adSetName: adSet.name ?? null,
            media,
            body: creative.body ?? null,
            linkUrl: creative.linkUrl ?? null,
            thumbnailUrl: creative.thumbnailUrl ?? null,
            platformObjective: ad.platformObjective ?? null,
            optimizationGoal: ad.optimizationGoal ?? null,
            bidStrategy: ad.bidStrategy ?? null,
            stats: statsFrom(ad.metrics),
            externalId: adExternalId,
          },
        });
      }
    }
  }

  // Ad sets first: the ads reference them by row id.
  const setRowIdByExternalId = new Map<string, string>();
  if (sets.length) {
    const existing = await db
      .select({
        id: platformAdSetTable.id,
        externalId: platformAdSetTable.externalId,
      })
      .from(platformAdSetTable)
      .where(
        inArray(
          platformAdSetTable.externalId,
          sets.map((row) => row.externalId),
        ),
      );
    for (const row of existing) {
      if (row.externalId) setRowIdByExternalId.set(row.externalId, row.id);
    }
    for (const pending of sets) {
      const known = setRowIdByExternalId.get(pending.externalId);
      if (known) {
        // Never null out plan lineage the push stamped: sync updates what the
        // platform reports, not what the plan meant.
        const { audienceId: _audienceId, ...values } = pending.values;
        await db
          .update(platformAdSetTable)
          .set(values)
          .where(eq(platformAdSetTable.id, known));
      } else {
        const [inserted] = await db
          .insert(platformAdSetTable)
          .values(pending.values)
          .returning({ id: platformAdSetTable.id });
        if (inserted) setRowIdByExternalId.set(pending.externalId, inserted.id);
      }
    }
  }

  let adsWritten = 0;
  if (ads.length) {
    const existing = await db
      .select({
        id: platformAdTable.id,
        externalId: platformAdTable.externalId,
      })
      .from(platformAdTable)
      .where(
        and(
          eq(platformAdTable.brandId, input.brandId),
          inArray(
            platformAdTable.externalId,
            ads.map((row) => row.externalId),
          ),
        ),
      );
    const adRowIdByExternalId = new Map(
      existing.flatMap((row) =>
        row.externalId ? [[row.externalId, row.id]] : [],
      ),
    );
    for (const pending of ads) {
      const values = {
        ...pending.values,
        platformAdSetId: pending.adSetExternalId
          ? (setRowIdByExternalId.get(pending.adSetExternalId) ?? null)
          : null,
      };
      const known = adRowIdByExternalId.get(pending.externalId);
      if (known) {
        // Same rule as ad sets: the push's adId lineage survives re-syncs.
        const { adId: _adId, ...update } = values;
        await db
          .update(platformAdTable)
          .set(update)
          .where(eq(platformAdTable.id, known));
      } else {
        await db.insert(platformAdTable).values(values);
      }
      adsWritten++;
    }
  }

  return { adSets: setRowIdByExternalId.size, ads: adsWritten };
}

export async function syncZernioAds(
  options?: {
    brandSlug?: string;
    /** channel_platform ad value; default "meta_ads" (original behavior). */
    platform?: ChannelPlatform;
    /** Scope to one platform ad account (e.g. a Google customer id). */
    adAccountId?: string;
  } & AdsSyncFilters,
): Promise<{
  brandId: string;
  channelId: string;
  candidates: number;
  inserted: number;
  updated: number;
  skipped: number;
  byObjective: Record<string, number>;
  /** Performance+ cycles whose observed spend was refreshed from this sync. */
  cyclesRepriced: number;
  /** Ad set and ad rows mirrored from the tree. */
  adSetsWritten: number;
  adsWritten: number;
  /** Live campaigns no longer on the platform, marked ended. */
  reconciled: number;
  /** Campaigns the tree returned but the ingest window excluded. */
  filteredOut: number;
  /** The window actually applied, so a caller can see what it did not fetch. */
  appliedFilters: {
    sinceDays: number | null;
    minSpend: number | null;
    statuses: string[] | null;
    limit: number | null;
  };
  errors: string[];
}> {
  const brandSlug = options?.brandSlug ?? "wander";
  const platform = options?.platform ?? "meta_ads";
  const errors: string[] = [];

  if (!isZernioConfigured) throw new Error("ZERNIO_API_KEY not configured");

  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.slug, brandSlug),
  });
  if (!brand) throw new Error(`Brand "${brandSlug}" not found`);

  // Scoped to THIS brand's allowed accounts, not the global allowed set.
  // Zernio's tree spans the whole workspace, so with the global set a sync
  // for one brand ingested every other brand's campaigns under its channels
  // (caught on the first client-brand sync, 2026-08-27). Cross-brand
  // attribution is worse than under-ingesting; a campaign nobody's brand
  // claims stays out until its account is allowed on the right brand.
  const allowedAccounts = await getAllowedAdAccountIds(brand.id);
  // Allowlist rows and the tree can spell the same account differently (Meta
  // `act_` prefix, Google dashes, LinkedIn URNs); compare canonical forms.
  const normalize =
    adPlatformSpec(platform)?.zernio?.normalizeAccountId ??
    ((value: string) => value);
  const allowedNormalized = new Set(
    [...allowedAccounts].map((value) => normalize(value)),
  );
  const isAllowed = (acct: string) => allowedNormalized.has(normalize(acct));
  const sameAccount = (a: string, b: string) => normalize(a) === normalize(b);

  const sinceDays =
    options?.sinceDays === null
      ? null
      : (options?.sinceDays ?? ADS_SYNC_DEFAULT_SINCE_DAYS);
  const minSpend = options?.minSpend ?? null;
  const statuses =
    options?.statuses?.map((value) => value.toLowerCase()) ?? null;
  const limit = options?.limit ?? null;
  const cutoff =
    sinceDays === null ? null : Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const appliedFilters = { sinceDays, minSpend, statuses, limit };

  const campaignMoment = (obj: Record<string, unknown>) => {
    const raw =
      str(obj.platformCreatedAt) ??
      str(obj.startTime) ??
      str(obj.startAt) ??
      str(obj.updatedAt) ??
      str(obj.createdAt);
    const parsed = raw ? Date.parse(raw) : Number.NaN;
    return Number.isNaN(parsed) ? null : parsed;
  };
  const campaignSpend = (obj: Record<string, unknown>) => {
    const metrics = obj.metrics as Record<string, unknown> | undefined;
    const value = metrics?.spend ?? obj.spend;
    return typeof value === "number" ? value : Number(value ?? 0) || 0;
  };

  const fullTree = await getZernioAdsTree();
  const scoped = fullTree.filter((c) => {
    const obj = c as Record<string, unknown>;
    if (campaignPlatform(obj) !== platform) return false;
    const acct = str(obj.platformAdAccountId);
    if (!acct || !isAllowed(acct)) return false; // default-deny
    if (options?.adAccountId && !sameAccount(acct, options.adAccountId))
      return false;
    return true;
  });

  // Window applied after the allowlist so default-deny is never widened by it.
  // A campaign with no parseable date is KEPT: an unknown age is not evidence
  // of being stale, and dropping it would silently hide a live campaign.
  let tree = scoped.filter((c) => {
    const obj = c as Record<string, unknown>;
    if (cutoff !== null) {
      const moment = campaignMoment(obj);
      if (moment !== null && moment < cutoff) return false;
    }
    if (minSpend !== null && campaignSpend(obj) < minSpend) return false;
    if (statuses) {
      const status = str(obj.status)?.toLowerCase();
      if (!status || !statuses.includes(status)) return false;
    }
    return true;
  });
  tree.sort((a, b) => {
    const left = campaignMoment(a) ?? 0;
    const right = campaignMoment(b) ?? 0;
    return right - left;
  });
  if (limit !== null) tree = tree.slice(0, limit);
  const filteredOut = scoped.length - tree.length;
  if (tree.length === 0) {
    return {
      brandId: brand.id,
      channelId: "",
      candidates: 0,
      cyclesRepriced: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      adSetsWritten: 0,
      adsWritten: 0,
      reconciled: 0,
      byObjective: {},
      filteredOut,
      appliedFilters,
      errors: ["empty ads tree"],
    };
  }

  // Resolve (or create) the ad-account channel from the first campaign.
  const first = tree[0] as Record<string, unknown>;
  const accountId = str(first.platformAdAccountId);
  const accountName = str(first.platformAdAccountName);

  // Prefer an exact externalId match (a brand can hold several ad accounts on
  // one platform — e.g. WanderOS holds both Google Supply and Sites); fall
  // back to a placeholder row for this platform (no externalId yet).
  const platformChannels = await db.query.channelTable.findMany({
    where: and(
      eq(channelTable.brandId, brand.id),
      eq(channelTable.platform, platform),
    ),
  });
  let channel =
    (accountId &&
      platformChannels.find(
        (ch) => ch.externalId && sameAccount(ch.externalId, accountId),
      )) ||
    platformChannels.find((ch) => !ch.externalId);
  if (channel && accountId && !channel.externalId) {
    // Backfill the placeholder row with the real account identity.
    const [updatedChannel] = await db
      .update(channelTable)
      .set({
        externalId: accountId,
        displayName: channel.displayName ?? accountName,
        manageUrl: channel.manageUrl ?? accountManageUrl(platform, accountId),
      })
      .where(eq(channelTable.id, channel.id))
      .returning();
    channel = updatedChannel;
  }
  if (!channel) {
    const [created] = await db
      .insert(channelTable)
      .values({
        brandId: brand.id,
        kind: "ad",
        platform,
        displayName: accountName ?? platform,
        externalId: accountId,
        manageUrl: accountManageUrl(platform, accountId),
      })
      .returning();
    channel = created;
  }
  const channelId = channel!.id;

  // --- Build candidate campaign rows from the tree ---
  const candidates: CampaignInsert[] = [];
  let skippedJunk = 0;
  for (const c of tree) {
    const obj = c as Record<string, unknown>;
    const externalId = str(obj.platformCampaignId) ?? c.id ?? c._id;
    if (!externalId) continue;

    const ads = flattenAds(c);
    const dates = ads.map(adDateMs).filter((x): x is number => x !== undefined);
    const firstMs = dates.length ? Math.min(...dates) : undefined;
    const lastMs = dates.length ? Math.max(...dates) : undefined;

    // Drop pre-account-era junk (boosted posts / abandoned 2022 tests).
    if (lastMs !== undefined && lastMs < MIN_CAMPAIGN_DATE) {
      skippedJunk++;
      continue;
    }

    const status = mapStatus(c.status);
    const stats = buildStats(obj, ads);

    candidates.push({
      channelId,
      brandId: brand.id,
      platform,
      name: str(obj.campaignName) ?? c.name ?? externalId,
      status,
      // Google campaigns carry no platformObjective; the channel type
      // (SEARCH / PERFORMANCE_MAX / DISPLAY / DEMAND_GEN) is the objective.
      objective: str(obj.platformObjective) ?? str(obj.advertisingChannelType),
      startAt: firstMs !== undefined ? new Date(firstMs) : undefined,
      // Active campaigns are ongoing — no end date. Else last creative date.
      endAt:
        status === "live" || lastMs === undefined
          ? undefined
          : new Date(lastMs),
      spend: stats.spend !== undefined ? Math.round(stats.spend) : undefined,
      adCount: ads.length,
      stats,
      heroThumbnailUrl: pickHeroThumbnail(ads),
      externalId,
      manageUrl: campaignManageUrl(
        platform,
        str(obj.platformAdAccountId) ?? accountId,
        externalId,
      ),
    });
  }

  // --- Upsert keyed on (brand, externalId) ---
  const extIds = candidates
    .map((c) => c.externalId)
    .filter((x): x is string => !!x);
  const existing = extIds.length
    ? await db
        .select({
          id: platformCampaignTable.id,
          externalId: platformCampaignTable.externalId,
        })
        .from(platformCampaignTable)
        .where(
          and(
            eq(platformCampaignTable.brandId, brand.id),
            inArray(platformCampaignTable.externalId, extIds),
          ),
        )
    : [];
  const idByExt = new Map(existing.map((r) => [r.externalId, r.id]));

  const toInsert: CampaignInsert[] = [];
  let updated = 0;
  for (const c of candidates) {
    const existingId = c.externalId ? idByExt.get(c.externalId) : undefined;
    if (existingId) {
      await db
        .update(platformCampaignTable)
        .set({
          name: c.name,
          status: c.status,
          objective: c.objective,
          startAt: c.startAt,
          endAt: c.endAt,
          spend: c.spend,
          adCount: c.adCount,
          stats: c.stats,
          heroThumbnailUrl: c.heroThumbnailUrl,
          channelId: c.channelId,
          manageUrl: c.manageUrl,
        })
        .where(eq(platformCampaignTable.id, existingId));
      updated++;
    } else {
      toInsert.push(c);
    }
  }

  if (toInsert.length) {
    for (let i = 0; i < toInsert.length; i += 100) {
      await db.insert(platformCampaignTable).values(toInsert.slice(i, i + 100));
    }
  }

  // --- Mirror the tree's ad sets and ads into real rows ----------------
  const rowIds = extIds.length
    ? await db
        .select({
          id: platformCampaignTable.id,
          externalId: platformCampaignTable.externalId,
        })
        .from(platformCampaignTable)
        .where(
          and(
            eq(platformCampaignTable.brandId, brand.id),
            inArray(platformCampaignTable.externalId, extIds),
          ),
        )
    : [];
  const rowIdByExternalId = new Map(
    rowIds.flatMap((row) => (row.externalId ? [[row.externalId, row.id]] : [])),
  );
  let children = { adSets: 0, ads: 0 };
  try {
    children = await syncCampaignChildren({
      brandId: brand.id,
      channelId,
      platform,
      tree,
      rowIdByExternalId,
    });
  } catch (error) {
    errors.push(
      `ad set/ad mirror failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // --- Reconcile campaigns that vanished from the platform -------------
  // Absence from the tree only means "deleted" when the tree was complete.
  // Any applied window (sinceDays, minSpend, statuses, limit) or any error
  // can drop a campaign that is alive and well, so a partial sync reconciles
  // nothing. Status is restored on the next sync if the campaign reappears,
  // which keeps this reversible.
  let reconciled = 0;
  const treeWasComplete = treeIsCompleteEnoughToReconcile({
    filteredOut,
    errorCount: errors.length,
    accountScoped: Boolean(options?.adAccountId),
    limit,
    sinceDays,
    minSpend,
    statuses,
  });
  if (treeWasComplete && extIds.length) {
    const gone = await db
      .update(platformCampaignTable)
      .set({ status: "ended" })
      .where(
        and(
          eq(platformCampaignTable.brandId, brand.id),
          eq(platformCampaignTable.channelId, channelId),
          // Only rows that came from the platform can vanish from it. A
          // campaign authored here and never pushed has no externalId, so it
          // is not "gone" — it was never there.
          isNotNull(platformCampaignTable.externalId),
          notInArray(platformCampaignTable.externalId, extIds),
          ne(platformCampaignTable.status, "ended"),
        ),
      )
      .returning({ id: platformCampaignTable.id });
    reconciled = gone.length;
  }

  const byObjective: Record<string, number> = {};
  for (const c of candidates) {
    const k = c.objective ?? "(none)";
    byObjective[k] = (byObjective[k] ?? 0) + 1;
  }

  // Observed spend for Performance+ cycles is derived from the campaign rows
  // this sync just refreshed, so it rides the same compute wake rather than
  // earning a cron mark of its own. A failure here must not fail the sync.
  let cyclesRepriced = 0;
  try {
    cyclesRepriced = (await recomputeAllPerformanceCycleSpend()).cycles;
  } catch (error) {
    errors.push(
      `cycle spend rollup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    brandId: brand.id,
    channelId,
    candidates: candidates.length,
    inserted: toInsert.length,
    updated,
    skipped: skippedJunk,
    adSetsWritten: children.adSets,
    adsWritten: children.ads,
    reconciled,
    byObjective,
    cyclesRepriced,
    filteredOut,
    appliedFilters,
    errors,
  };
}
