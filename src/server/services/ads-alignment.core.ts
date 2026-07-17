import type { Campaign, Initiative } from "@/server/db/schema";

// ---------------------------------------------------------------------------
// Intent vs. actual — the diff between the strategy layer (initiative:
// targetChannels/budget/dates, authored by hand) and platform reality
// (campaign rows synced from Zernio). Read-only: the fix for any drift is a
// link/unlink mutation or a change made in the platform's own manager.
// ---------------------------------------------------------------------------

/** Campaign statuses that count as "delivering on the intent". */
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
  status: Campaign["status"];
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
  /** Name-token overlap with the initiative (0 = only platform/date matched). */
  score: number;
};

export type InitiativeAlignment = {
  initiativeId: string;
  name: string;
  status: Initiative["status"];
  targetChannels: string[];
  channels: ChannelAlignment[];
  /** Linked campaigns running on platforms the initiative never asked for. */
  unplanned: AlignedCampaign[];
  budget: {
    intended: number | undefined;
    linkedBudget: number;
    linkedSpend: number;
    /** linkedSpend / intended, when an intended budget exists. */
    utilization: number | undefined;
    overIntended: boolean;
  };
  /** Linked campaigns whose end date runs past the initiative's end date. */
  dateDrift: AlignedCampaign[];
  /** Unlinked same-brand campaigns that plausibly implement this initiative. */
  suggestions: CampaignSuggestion[];
};

// ---- pure core (unit-tested; no db) ---------------------------------------

function campaignSpend(c: Campaign): number | undefined {
  return c.stats?.spend ?? c.spend ?? undefined;
}

function toAligned(c: Campaign): AlignedCampaign {
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
export function nameTokens(...parts: Array<string | null | undefined>): string[] {
  const tokens = new Set<string>();
  for (const part of parts) {
    for (const raw of (part ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
      if (raw.length > 3) tokens.add(raw);
    }
  }
  return [...tokens];
}

/** Date-window overlap; open-ended sides are treated as always overlapping. */
export function windowsOverlap(
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
 * Score an unlinked campaign as a candidate implementation of an initiative:
 * platform must be intended, date windows must overlap; ranked by how many
 * of the initiative's name/goal/slug tokens appear in the campaign name.
 */
export function scoreSuggestion(
  initiative: Pick<
    Initiative,
    "name" | "slug" | "goal" | "targetChannels" | "startAt" | "endAt"
  >,
  campaign: Campaign,
): number | undefined {
  const intended = initiative.targetChannels ?? [];
  if (!intended.includes(campaign.platform)) return undefined;
  if (
    !windowsOverlap(
      initiative.startAt,
      initiative.endAt,
      campaign.startAt,
      campaign.endAt,
    )
  ) {
    return undefined;
  }
  const tokens = nameTokens(initiative.name, initiative.slug, initiative.goal);
  const haystack = campaign.name.toLowerCase();
  return tokens.filter((t) => haystack.includes(t)).length;
}

/** The pure diff: intent + linked reality + unlinked candidates → alignment. */
export function diffInitiative(
  initiative: Initiative,
  linked: Campaign[],
  unlinkedCandidates: Campaign[],
): InitiativeAlignment {
  const targetChannels = initiative.targetChannels ?? [];

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
  const intended = initiative.budget ?? undefined;

  const dateDrift = initiative.endAt
    ? linked
        .filter(
          (c) =>
            FULFILLING_STATUSES.has(c.status) &&
            c.endAt !== null &&
            c.endAt > initiative.endAt!,
        )
        .map(toAligned)
    : [];

  const suggestions = unlinkedCandidates
    .map((c) => ({ campaign: c, score: scoreSuggestion(initiative, c) }))
    .filter((s): s is { campaign: Campaign; score: number } => s.score !== undefined)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (campaignSpend(b.campaign) ?? 0) - (campaignSpend(a.campaign) ?? 0),
    )
    .slice(0, 10)
    .map((s) => ({ ...toAligned(s.campaign), score: s.score }));

  return {
    initiativeId: initiative.id,
    name: initiative.name,
    status: initiative.status,
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
