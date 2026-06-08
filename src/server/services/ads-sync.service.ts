import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import {
  type AdStats,
  campaignTable,
  type CampaignStatus,
} from "@/server/db/ads-schema";
import { brandTable } from "@/server/db/brand-schema";
import { channelTable } from "@/server/db/channel-schema";
import {
  getZernioAdsTree,
  isZernioConfigured,
  type ZernioAd,
  type ZernioAdsTreeCampaign,
} from "@/server/clients/zernio.client";

// Campaigns whose latest creative predates this are pre-account-era junk
// (boosted organic posts, abandoned 2022 tests). See zernio-ads-validate.ts.
const MIN_CAMPAIGN_DATE = Date.parse("2024-01-01");

type CampaignInsert = typeof campaignTable.$inferInsert;

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

// Zernio campaign status → our enum. The tree reports lowercase active/paused.
function mapStatus(raw: unknown): CampaignStatus {
  switch (str(raw)?.toLowerCase()) {
    case "active":
      return "live";
    case "paused":
      return "paused";
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
function buildStats(
  campaign: Record<string, unknown>,
  ads: ZernioAd[],
): AdStats {
  const m =
    campaign.metrics && typeof campaign.metrics === "object"
      ? (campaign.metrics as Record<string, unknown>)
      : undefined;
  if (m) {
    return {
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
  }
  // Fallback: sum the spend across ads (other rates aren't meaningfully summable).
  let spend = 0;
  for (const a of ads) {
    const am = a.metrics;
    spend += num(am?.spend) ?? 0;
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
    const spend = num((a.metrics)?.spend) ?? 0;
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

function manageUrl(accountId: string | undefined, campaignId: string | undefined): string | undefined {
  if (!accountId || !campaignId) return undefined;
  const act = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${act.replace("act_", "")}&selected_campaign_ids=${campaignId}`;
}

/**
 * Pull Wander's Meta ad campaigns from Zernio (`/ads/tree`) and upsert them into
 * `campaign` (one row per Zernio campaign, keyed on platformCampaignId). Stores a
 * latest metrics snapshot + one hero creative so feed/calendar can render a card
 * without touching `ad_spot`. Idempotent — safe to re-run; updates metrics in
 * place. `initiativeId` is left null (the throughline is authored by hand).
 */
export async function syncZernioAds(options?: {
  brandSlug?: string;
}): Promise<{
  brandId: string;
  channelId: string;
  candidates: number;
  inserted: number;
  updated: number;
  skipped: number;
  byObjective: Record<string, number>;
  errors: string[];
}> {
  const brandSlug = options?.brandSlug ?? "wander";
  const errors: string[] = [];

  if (!isZernioConfigured) throw new Error("ZERNIO_API_KEY not configured");

  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.slug, brandSlug),
  });
  if (!brand) throw new Error(`Brand "${brandSlug}" not found`);

  const tree = await getZernioAdsTree();
  if (tree.length === 0) {
    return {
      brandId: brand.id,
      channelId: "",
      candidates: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      byObjective: {},
      errors: ["empty ads tree"],
    };
  }

  // Resolve (or create) the Meta ad-account channel from the first campaign.
  const first = tree[0] as Record<string, unknown>;
  const accountId = str(first.platformAdAccountId);
  const accountName = str(first.platformAdAccountName);

  let channel = await db.query.channelTable.findFirst({
    where: and(
      eq(channelTable.brandId, brand.id),
      eq(channelTable.platform, "meta_ads"),
    ),
  });
  if (!channel) {
    const [created] = await db
      .insert(channelTable)
      .values({
        brandId: brand.id,
        kind: "ad",
        platform: "meta_ads",
        displayName: accountName ?? "Meta Ads",
        externalId: accountId,
        manageUrl: accountId
          ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountId.replace("act_", "")}`
          : undefined,
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
      platform: "meta_ads",
      name: str(obj.campaignName) ?? c.name ?? externalId,
      status,
      objective: str(obj.platformObjective),
      startAt: firstMs !== undefined ? new Date(firstMs) : undefined,
      // Active campaigns are ongoing — no end date. Else last creative date.
      endAt: status === "live" || lastMs === undefined ? undefined : new Date(lastMs),
      spend: stats.spend !== undefined ? Math.round(stats.spend) : undefined,
      adSpots: ads.length,
      stats,
      heroThumbnailUrl: pickHeroThumbnail(ads),
      externalId,
      manageUrl: manageUrl(accountId, externalId),
    });
  }

  // --- Upsert keyed on (brand, externalId) ---
  const extIds = candidates
    .map((c) => c.externalId)
    .filter((x): x is string => !!x);
  const existing = extIds.length
    ? await db
        .select({ id: campaignTable.id, externalId: campaignTable.externalId })
        .from(campaignTable)
        .where(
          and(
            eq(campaignTable.brandId, brand.id),
            inArray(campaignTable.externalId, extIds),
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
        .update(campaignTable)
        .set({
          name: c.name,
          status: c.status,
          objective: c.objective,
          startAt: c.startAt,
          endAt: c.endAt,
          spend: c.spend,
          adSpots: c.adSpots,
          stats: c.stats,
          heroThumbnailUrl: c.heroThumbnailUrl,
          channelId: c.channelId,
          manageUrl: c.manageUrl,
        })
        .where(eq(campaignTable.id, existingId));
      updated++;
    } else {
      toInsert.push(c);
    }
  }

  if (toInsert.length) {
    for (let i = 0; i < toInsert.length; i += 100) {
      await db.insert(campaignTable).values(toInsert.slice(i, i + 100));
    }
  }

  const byObjective: Record<string, number> = {};
  for (const c of candidates) {
    const k = c.objective ?? "(none)";
    byObjective[k] = (byObjective[k] ?? 0) + 1;
  }

  return {
    brandId: brand.id,
    channelId,
    candidates: candidates.length,
    inserted: toInsert.length,
    updated,
    skipped: skippedJunk,
    byObjective,
    errors,
  };
}
