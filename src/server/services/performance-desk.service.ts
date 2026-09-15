import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  DELIVERY_STAGES,
  isClientStage,
  isClosedStage,
  laterStage,
  type BusinessStage,
  type DeliveryStage,
} from "@/lib/performance-stage";
import { type BillingSummary } from "@/lib/performance-billing";
import { db } from "@/server/db";
import {
  brandIntakeUrl,
  brandPitchUrl,
} from "@/server/services/brand-connect.service";
import {
  brandTable,
  campaignTable,
  performanceAccountTable,
  performanceCycleTable,
  platformCampaignTable,
  type HomesRun,
  type PlatformCampaign,
} from "@/server/db/schema";

export type DeskCampaignState = "draft" | "pushed" | "live" | "ended";

export type DeskCampaign = {
  id: string;
  name: string;
  brandId: string;
  createdAt: Date;
  state: DeskCampaignState;
  platforms: { id: string; platform: string; status: string }[];
  /** Whole dollars spent, as the platforms report it. */
  spend: number;
  /** Whole dollars: platform budgets when planned, else the advisory total. */
  budget: number;
  /** Where spend sits against time, when the platform rows carry dates. */
  pace: "ahead" | "on" | "behind" | null;
  adCount: number;
  lastHomesRun: HomesRun | null;
  /**
   * The client this campaign is billed to when it runs under Wander's own
   * brand: the account on the cycle it is attached to. Null when the campaign
   * runs as the client's brand, where the brand already says who it is for.
   */
  accountName: string | null;
};

export type DeskBrand = {
  id: string;
  name: string;
  slug: string | null;
  logo: string | null;
  website: string | null;
  relationship: "internal" | "client" | "prospect" | "reference";
  /** The money and the relationship, as a person last set it. */
  business: BusinessStage;
  businessAt: Date | null;
  /**
   * The production line: the stored stage, or further along when the
   * campaigns say so (ads ready to review, live, paused).
   */
  delivery: DeliveryStage;
  deliveryAt: Date | null;
  hasMark: boolean;
  /** The client-facing intake form on wander.com, by slug or by connect token. */
  intakeUrl: string | null;
  /** The pitch page on wander.com a rep sends before anything is signed. Slug only. */
  pitchUrl: string | null;
  account: { id: string; status: string; plan: string | null } | null;
  /** This month's fee and media lines, from the newest cycle. Null before the first payment. */
  billing: BillingSummary | null;
  campaigns: DeskCampaign[];
  /** The furthest along any of this brand's campaigns is. */
  best: DeskCampaignState | null;
};

export type PerformanceDesk = {
  brands: DeskBrand[];
  campaigns: DeskCampaign[];
  live: DeskCampaign[];
  liveSpend: number;
  liveBudget: number;
  clients: number;
  prospects: number;
};

const RANK: Record<DeskCampaignState, number> = {
  live: 0,
  pushed: 1,
  draft: 2,
  ended: 3,
};

function stateOf(rows: PlatformCampaign[]): DeskCampaignState {
  if (rows.some((row) => row.status === "live")) return "live";
  if (rows.some((row) => row.externalId)) {
    return rows.every((row) => row.status === "ended") ? "ended" : "pushed";
  }
  return "draft";
}

/**
 * Spend against budget, read against time. A campaign 40% through its window
 * that has spent 20% is behind. Only platform rows with dates and a budget
 * count; without them there is no pace to speak of.
 */
function paceOf(rows: PlatformCampaign[], spend: number): DeskCampaign["pace"] {
  const dated = rows.filter((row) => row.startAt && row.endAt && row.budget);
  if (dated.length === 0) return null;
  const now = Date.now();
  const expected = dated.reduce((sum, row) => {
    const start = row.startAt!.getTime();
    const end = row.endAt!.getTime();
    const fraction =
      end > start ? Math.min(1, Math.max(0, (now - start) / (end - start))) : 1;
    return sum + fraction * (row.budget ?? 0);
  }, 0);
  if (expected <= 0) return null;
  const ratio = spend / expected;
  return ratio > 1.15 ? "ahead" : ratio < 0.85 ? "behind" : "on";
}

/**
 * Everything the Wander Performance section shows, read once: the clients and
 * prospects, their campaigns with where each stands, and the live totals.
 * Wander's own brands are not on the desk at all; their campaigns live on the
 * brand pages.
 */
export async function loadPerformanceDesk(
  organizationId: string,
): Promise<PerformanceDesk> {
  const brandRows = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, organizationId),
      isNull(brandTable.deletedAt),
    ),
    columns: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      website: true,
      relationship: true,
      brandMark: true,
      connectToken: true,
      businessStage: true,
      businessStageAt: true,
      deliveryStage: true,
      deliveryStageAt: true,
    },
    orderBy: (brand, { asc }) => [asc(brand.name)],
  });
  const brandIds = brandRows.map((brand) => brand.id);
  if (brandIds.length === 0) {
    return {
      brands: [],
      campaigns: [],
      live: [],
      liveSpend: 0,
      liveBudget: 0,
      clients: 0,
      prospects: 0,
    };
  }

  const [campaignRows, accounts] = await Promise.all([
    db.query.campaignTable.findMany({
      where: and(
        inArray(campaignTable.brandId, brandIds),
        isNull(campaignTable.deletedAt),
      ),
      columns: {
        id: true,
        brandId: true,
        name: true,
        budget: true,
        createdAt: true,
        homesRun: true,
        performanceCycleId: true,
      },
      with: { ads: { columns: { id: true } } },
      orderBy: (campaign, { desc }) => [desc(campaign.createdAt)],
    }),
    db.query.performanceAccountTable.findMany({
      where: and(
        inArray(performanceAccountTable.brandId, brandIds),
        isNull(performanceAccountTable.deletedAt),
      ),
      columns: { id: true, brandId: true, status: true, plan: true },
    }),
  ]);
  const cycleIds = campaignRows
    .map((campaign) => campaign.performanceCycleId)
    .filter((id): id is string => Boolean(id));
  const cycles = cycleIds.length
    ? await db.query.performanceCycleTable.findMany({
        where: inArray(performanceCycleTable.id, cycleIds),
        columns: { id: true, accountId: true },
        with: { account: { columns: { name: true } } },
      })
    : [];
  const accountNameByCycle = new Map(
    cycles.map((cycle) => [cycle.id, cycle.account?.name ?? null] as const),
  );
  const platformRows = campaignRows.length
    ? await db.query.platformCampaignTable.findMany({
        where: inArray(
          platformCampaignTable.campaignId,
          campaignRows.map((campaign) => campaign.id),
        ),
      })
    : [];

  const rowsByCampaign = new Map<string, PlatformCampaign[]>();
  for (const row of platformRows) {
    if (!row.campaignId) continue;
    rowsByCampaign.set(row.campaignId, [
      ...(rowsByCampaign.get(row.campaignId) ?? []),
      row,
    ]);
  }
  const accountByBrand = new Map(
    accounts.map((account) => [account.brandId, account]),
  );
  const accountIds = accounts.map((account) => account.id);
  const cycleRows = accountIds.length
    ? await db.query.performanceCycleTable.findMany({
        where: inArray(performanceCycleTable.accountId, accountIds),
        orderBy: (cycle, { desc }) => [desc(cycle.period)],
        columns: {
          accountId: true,
          period: true,
          billedAmount: true,
          mediaBudget: true,
          feePaidAt: true,
          mediaPaidAt: true,
          actualSpendCents: true,
        },
      })
    : [];
  // Newest first, so the first row seen per account is the current cycle.
  const cycleByAccount = new Map<string, (typeof cycleRows)[number]>();
  for (const cycle of cycleRows) {
    if (!cycleByAccount.has(cycle.accountId))
      cycleByAccount.set(cycle.accountId, cycle);
  }

  const campaigns: DeskCampaign[] = campaignRows.map((campaign) => {
    const rows = rowsByCampaign.get(campaign.id) ?? [];
    const spend = rows.reduce(
      (sum, row) => sum + (row.stats?.spend ?? row.spend ?? 0),
      0,
    );
    const platformBudget = rows.reduce(
      (sum, row) => sum + (row.budget ?? 0),
      0,
    );
    return {
      id: campaign.id,
      name: campaign.name,
      brandId: campaign.brandId,
      createdAt: campaign.createdAt,
      state: stateOf(rows),
      platforms: rows.map((row) => ({
        id: row.id,
        platform: row.platform,
        status: row.status,
      })),
      spend,
      budget: platformBudget > 0 ? platformBudget : (campaign.budget ?? 0),
      pace: paceOf(rows, spend),
      adCount: campaign.ads.length,
      lastHomesRun: campaign.homesRun ?? null,
      accountName: campaign.performanceCycleId
        ? (accountNameByCycle.get(campaign.performanceCycleId) ?? null)
        : null,
    };
  });
  const campaignsByBrand = new Map<string, DeskCampaign[]>();
  for (const campaign of campaigns) {
    campaignsByBrand.set(campaign.brandId, [
      ...(campaignsByBrand.get(campaign.brandId) ?? []),
      campaign,
    ]);
  }

  const brands: DeskBrand[] = brandRows
    .filter(
      (brand) =>
        brand.relationship === "client" || brand.relationship === "prospect",
    )
    .map((brand) => {
      const own = campaignsByBrand.get(brand.id) ?? [];
      const account = accountByBrand.get(brand.id);
      const cycle = account ? cycleByAccount.get(account.id) : undefined;
      const billing: BillingSummary | null = cycle
        ? {
            period: cycle.period,
            fee: { amount: cycle.billedAmount, paidAt: cycle.feePaidAt },
            media: { amount: cycle.mediaBudget, paidAt: cycle.mediaPaidAt },
            spend:
              cycle.actualSpendCents != null
                ? Math.round(cycle.actualSpendCents / 100)
                : own.reduce((sum, campaign) => sum + campaign.spend, 0),
          }
        : null;
      const business: BusinessStage =
        brand.businessStage ??
        (brand.relationship === "client" ? "signed" : "prospect");
      return {
        business,
        businessAt: brand.businessStageAt,
        delivery: effectiveDelivery(brand.deliveryStage, business, own),
        deliveryAt: brand.deliveryStageAt,
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
        logo: brand.logo,
        website: brand.website,
        relationship: brand.relationship,
        hasMark: Boolean(brand.brandMark),
        intakeUrl: brand.slug
          ? brandIntakeUrl(brand.slug)
          : brand.connectToken
            ? brandIntakeUrl(brand.connectToken)
            : null,
        pitchUrl: brand.slug ? brandPitchUrl(brand.slug) : null,
        account: account
          ? { id: account.id, status: account.status, plan: account.plan }
          : null,
        campaigns: own,
        billing,
        best: own.reduce<DeskCampaignState | null>(
          (acc, campaign) =>
            acc === null || RANK[campaign.state] < RANK[acc]
              ? campaign.state
              : acc,
          null,
        ),
      };
    })
    .sort((a, b) => {
      const ra = a.best ? RANK[a.best] : 4;
      const rb = b.best ? RANK[b.best] : 4;
      if (ra !== rb) return ra - rb;
      if (a.relationship !== b.relationship)
        return a.relationship === "client" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const onDesk = new Set(brands.map((brand) => brand.id));
  const deskCampaigns = campaigns.filter((campaign) =>
    onDesk.has(campaign.brandId),
  );
  const live = deskCampaigns.filter((campaign) => campaign.state === "live");
  return {
    brands,
    campaigns: deskCampaigns,
    live,
    liveSpend: live.reduce((sum, campaign) => sum + campaign.spend, 0),
    liveBudget: live.reduce((sum, campaign) => sum + campaign.budget, 0),
    clients: brands.filter((brand) => isClientStage(brand.business)).length,
    prospects: brands.filter(
      (brand) =>
        !isClosedStage(brand.business) && !isClientStage(brand.business),
    ).length,
  };
}

/**
 * What the campaigns say about a brand's delivery, laid over what is stored.
 * A stored stage never moves backwards here, and a closed brand is left alone.
 */
function effectiveDelivery(
  stored: DeliveryStage | null,
  business: BusinessStage,
  campaigns: DeskCampaign[],
): DeliveryStage {
  const base: DeliveryStage = stored ?? "not_started";
  if (isClosedStage(business)) return base;
  let derived: DeliveryStage | null = null;
  if (campaigns.some((campaign) => campaign.state === "live")) derived = "live";
  else if (
    campaigns.some(
      (campaign) => campaign.state === "pushed" || campaign.state === "ended",
    )
  ) {
    derived = "paused";
  } else if (
    campaigns.some(
      (campaign) =>
        campaign.state === "draft" &&
        campaign.adCount > 0 &&
        campaign.platforms.length > 0,
    )
  ) {
    derived = "ads_review";
  }
  // Live and paused are only meaningful once the brand is a client; a
  // prospect with a test draft does not become "ads ready for review".
  if (derived && !isClientStage(business)) return base;
  return derived ? laterStage(DELIVERY_STAGES, base, derived) : base;
}

/** The desk for one side of the client line; closed brands leave both. */
export function narrowDesk(
  desk: PerformanceDesk,
  relationship: "client" | "prospect",
): PerformanceDesk {
  const brands = desk.brands.filter(
    (brand) =>
      !isClosedStage(brand.business) &&
      (relationship === "client"
        ? isClientStage(brand.business)
        : !isClientStage(brand.business)),
  );
  const ids = new Set(brands.map((brand) => brand.id));
  const campaigns = desk.campaigns.filter((campaign) =>
    ids.has(campaign.brandId),
  );
  const live = campaigns.filter((campaign) => campaign.state === "live");
  return {
    brands,
    campaigns,
    live,
    liveSpend: live.reduce((sum, campaign) => sum + campaign.spend, 0),
    liveBudget: live.reduce((sum, campaign) => sum + campaign.budget, 0),
    clients: desk.clients,
    prospects: desk.prospects,
  };
}

/** Whole dollars as the desk writes them. */
export function deskMoney(n: number | null | undefined) {
  return n == null
    ? "—"
    : n >= 1000
      ? `$${(n / 1000).toFixed(1)}K`
      : `$${Math.round(n)}`;
}
