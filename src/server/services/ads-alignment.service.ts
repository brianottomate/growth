import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  type PlatformCampaign,
  platformCampaignTable,
  type Campaign,
  campaignTable,
} from "@/server/db/schema";

// ---------------------------------------------------------------------------
// Intent vs. actual — the diff between the strategy layer (campaign:
// targetChannels/budget/dates, authored by hand) and platform reality
// (campaign rows synced from Zernio). Read-only: the fix for any drift is a
// link/unlink mutation or a change made in the platform's own manager.
// ---------------------------------------------------------------------------

/** PlatformCampaign statuses that count as "delivering on the intent". */
const FULFILLING_STATUSES = new Set(["live", "scheduled"]);

export type ChannelVerdict =
  /** At least one linked campaign is live/scheduled on the intended channel. */
  | "ok"
  /** No linked campaign exists on an intended channel. */
  | "missing"
  /** Linked campaigns exist but none are live/scheduled (paused/ended/draft). */
  | "inactive";

export type AlignedCampaign = {
  id: string;
  name: string;
  platform: string;
  status: PlatformCampaign["status"];
  /** Precise spend from the latest Zernio snapshot when present, else the coarse column. */
  spend: number | undefined;
  budget: number | undefined;
  manageUrl: string | null;
  endAt: Date | null;
};

export type ChannelAlignment = {
  platform: string;
  verdict: ChannelVerdict;
  campaigns: AlignedCampaign[];
};

export type CampaignSuggestion = AlignedCampaign & {
  /** Name-token overlap with the campaign (0 = only platform/date matched). */
  score: number;
};

export type CampaignAlignment = {
  campaignId: string;
  name: string;
  status: Campaign["status"];
  targetChannels: string[];
  channels: ChannelAlignment[];
  /** Linked campaigns running on platforms the campaign never asked for. */
  unplanned: AlignedCampaign[];
  budget: {
    intended: number | undefined;
    linkedBudget: number;
    linkedSpend: number;
    /** linkedSpend / intended, when an intended budget exists. */
    utilization: number | undefined;
    overIntended: boolean;
  };
  /** Linked campaigns whose end date runs past the campaign's end date. */
  dateDrift: AlignedCampaign[];
  /** Unlinked same-brand campaigns that plausibly implement this campaign. */
  suggestions: CampaignSuggestion[];
};

// ---- pure business rules (unit-tested through alignment outcomes; no db) ---

function campaignSpend(c: PlatformCampaign): number | undefined {
  return c.stats?.spend ?? c.spend ?? undefined;
}

function toAligned(c: PlatformCampaign): AlignedCampaign {
  return {
    id: c.id,
    name: c.name,
    platform: c.platform,
    status: c.status,
    spend: campaignSpend(c),
    budget: c.budget ?? undefined,
    manageUrl: c.manageUrl,
    endAt: c.endAt,
  };
}

/** Tokens worth matching on: lowercase, alphanumeric, length > 3. */
function nameTokens(...parts: Array<string | null | undefined>): string[] {
  const tokens = new Set<string>();
  for (const part of parts) {
    for (const raw of (part ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
      if (raw.length > 3) tokens.add(raw);
    }
  }
  return [...tokens];
}

/** Date-window overlap; open-ended sides are treated as always overlapping. */
function windowsOverlap(
  aStart: Date | null,
  aEnd: Date | null,
  bStart: Date | null,
  bEnd: Date | null,
): boolean {
  const startsBeforeEnd = !aStart || !bEnd || aStart <= bEnd;
  const endsAfterStart = !aEnd || !bStart || aEnd >= bStart;
  return startsBeforeEnd && endsAfterStart;
}

/**
 * Score an unlinked platform campaign as a candidate implementation of a
 * campaign: platform must be intended, date windows must overlap; ranked by
 * how many of the campaign's name/goal/slug tokens appear in the platform
 * campaign's name.
 */
export function scoreSuggestion(
  campaign: Pick<
    Campaign,
    "name" | "slug" | "goal" | "targetChannels" | "startAt" | "endAt"
  >,
  platformCampaign: PlatformCampaign,
): number | undefined {
  const intended = campaign.targetChannels ?? [];
  if (!intended.includes(platformCampaign.platform)) return undefined;
  if (
    !windowsOverlap(
      campaign.startAt,
      campaign.endAt,
      platformCampaign.startAt,
      platformCampaign.endAt,
    )
  ) {
    return undefined;
  }
  const tokens = nameTokens(campaign.name, campaign.slug, campaign.goal);
  const haystack = platformCampaign.name.toLowerCase();
  return tokens.filter((t) => haystack.includes(t)).length;
}

/** The pure diff: intent + linked reality + unlinked candidates → alignment. */
export function diffCampaign(
  campaign: Campaign,
  linked: PlatformCampaign[],
  unlinkedCandidates: PlatformCampaign[],
): CampaignAlignment {
  const targetChannels = campaign.targetChannels ?? [];

  const channels: ChannelAlignment[] = targetChannels.map((platform) => {
    const mine = linked.filter((c) => c.platform === platform);
    const verdict: ChannelVerdict =
      mine.length === 0
        ? "missing"
        : mine.some((c) => FULFILLING_STATUSES.has(c.status))
          ? "ok"
          : "inactive";
    return { platform, verdict, campaigns: mine.map(toAligned) };
  });

  const unplanned = linked
    .filter((c) => !targetChannels.includes(c.platform))
    .map(toAligned);

  const linkedBudget = linked.reduce((s, c) => s + (c.budget ?? 0), 0);
  const linkedSpend = linked.reduce((s, c) => s + (campaignSpend(c) ?? 0), 0);
  const intended = campaign.budget ?? undefined;

  const dateDrift = campaign.endAt
    ? linked
        .filter(
          (c) =>
            FULFILLING_STATUSES.has(c.status) &&
            c.endAt !== null &&
            c.endAt > campaign.endAt!,
        )
        .map(toAligned)
    : [];

  const suggestions = unlinkedCandidates
    .map((c) => ({ campaign: c, score: scoreSuggestion(campaign, c) }))
    .filter(
      (s): s is { campaign: PlatformCampaign; score: number } => s.score !== undefined,
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        (campaignSpend(b.campaign) ?? 0) - (campaignSpend(a.campaign) ?? 0),
    )
    .slice(0, 10)
    .map((s) => ({ ...toAligned(s.campaign), score: s.score }));

  return {
    campaignId: campaign.id,
    name: campaign.name,
    status: campaign.status,
    targetChannels,
    channels,
    unplanned,
    budget: {
      intended,
      linkedBudget,
      linkedSpend,
      utilization:
        intended && intended > 0 ? linkedSpend / intended : undefined,
      overIntended: intended !== undefined && linkedSpend > intended,
    },
    dateDrift,
    suggestions,
  };
}

// ---- db-backed entry points ------------------------------------------------

/** Full alignment for one campaign (detail page / capability). */
export async function computeCampaignAlignment(
  campaignId: string,
): Promise<CampaignAlignment> {
  const campaign = await db.query.campaignTable.findFirst({
    where: and(
      eq(campaignTable.id, campaignId),
      isNull(campaignTable.deletedAt),
    ),
  });
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  const [linked, unlinked] = await Promise.all([
    db.query.platformCampaignTable.findMany({
      where: eq(platformCampaignTable.campaignId, campaignId),
    }),
    db.query.platformCampaignTable.findMany({
      where: and(
        eq(platformCampaignTable.brandId, campaign.brandId),
        isNull(platformCampaignTable.campaignId),
      ),
    }),
  ]);

  return diffCampaign(campaign, linked, unlinked);
}

export type AlignmentOverviewRow = {
  campaignId: string;
  name: string;
  status: Campaign["status"];
  missingChannels: string[];
  inactiveChannels: string[];
  unplannedCount: number;
  budgetUtilization: number | undefined;
  overIntended: boolean;
  suggestionCount: number;
};

/** Compact per-campaign rollup for the /app/campaigns index. */
export async function computeAlignmentOverview(
  brandIds: string[],
): Promise<AlignmentOverviewRow[]> {
  if (brandIds.length === 0) return [];

  const campaigns = await db.query.campaignTable.findMany({
    where: and(
      inArray(campaignTable.brandId, brandIds),
      isNull(campaignTable.deletedAt),
      inArray(campaignTable.status, ["planned", "active", "paused"]),
    ),
  });
  if (campaigns.length === 0) return [];

  const platformCampaigns = await db.query.platformCampaignTable.findMany({
    where: inArray(platformCampaignTable.brandId, brandIds),
  });
  const linkedByCampaign = new Map<string, PlatformCampaign[]>();
  const unlinkedByBrand = new Map<string, PlatformCampaign[]>();
  for (const c of platformCampaigns) {
    if (c.campaignId) {
      const arr = linkedByCampaign.get(c.campaignId) ?? [];
      arr.push(c);
      linkedByCampaign.set(c.campaignId, arr);
    } else {
      const arr = unlinkedByBrand.get(c.brandId) ?? [];
      arr.push(c);
      unlinkedByBrand.set(c.brandId, arr);
    }
  }

  return campaigns.map((i) => {
    const alignment = diffCampaign(
      i,
      linkedByCampaign.get(i.id) ?? [],
      unlinkedByBrand.get(i.brandId) ?? [],
    );
    return {
      campaignId: i.id,
      name: i.name,
      status: i.status,
      missingChannels: alignment.channels
        .filter((c) => c.verdict === "missing")
        .map((c) => c.platform),
      inactiveChannels: alignment.channels
        .filter((c) => c.verdict === "inactive")
        .map((c) => c.platform),
      unplannedCount: alignment.unplanned.length,
      budgetUtilization: alignment.budget.utilization,
      overIntended: alignment.budget.overIntended,
      suggestionCount: alignment.suggestions.length,
    };
  });
}
