import { projectPaymentSettings } from "./performance-payment-state";
import "server-only";
import { inPrimaryGroup } from "./home-groups.service";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  isClientStage,
  isClosedStage,
  type BusinessStage,
  type DeliveryStage,
} from "@/lib/performance-stage";
import { currentPeriod, type BillingSummary } from "@/lib/performance-billing";
import type { PerformanceSettings } from "@/server/db/brand-schema";
import { db } from "@/server/db";
import {
  brandIntakeUrl,
  brandPitchUrl,
} from "@/server/services/brand-connect.service";
import {
  brandTable,
  campaignTable,
  homeTable,
  performanceAccountTable,
  performanceCycleTable,
  platformCampaignTable,
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
  approvedCount: number;
  /** The first image of up to four ads, for the row's preview strip. */
  thumbs: string[];
  /**
   * The client this campaign is billed to when it runs under Wander's own
   * brand: the account on the cycle it is attached to. Null when the campaign
   * runs as the client's brand, where the brand already says who it is for.
   */
  accountName: string | null;
};

type StaffMember = { id: string; name: string | null; image: string | null };

export type DeskBrand = {
  id: string;
  name: string;
  slug: string | null;
  logo: string | null;
  wanderOsWebsiteId: string | null;
  wanderOsCheckedAt: Date | null;
  website: string | null;
  relationship: "internal" | "client" | "prospect" | "reference";
  /** The money and the relationship, as a person last set it. */
  business: BusinessStage;
  businessAt: Date | null;
  /**
   * The saved delivery record; campaign activity never overrides it.
   */
  delivery: DeliveryStage;
  deliveryAt: Date | null;
  pipelineStage?:
    | import("@/lib/performance-pipeline").StoredPipelineStage
    | null;
  settings: PerformanceSettings | null;
  /** The lead covers sales, creative and delivery; CS has its own lead. */
  lead: StaffMember | null;
  csLead: StaffMember | null;
  hasMark: boolean;
  /** The client-facing intake form on wander.com, by slug or by connect token. */
  intakeUrl: string | null;
  /** The pitch page on wander.com a rep sends before anything is signed. Slug only. */
  pitchUrl: string | null;
  account: { id: string; status: string; plan: string | null } | null;
  /** This calendar month's fee and client media charge. */
  billing: BillingSummary | null;
  billingCycles?: {
    period: string;
    billedAmount: number | null;
    mediaBudget: number | null;
    clientMediaContribution: number | null;
    feeInvoiceState?: "Not invoiced" | "Open" | null;
    mediaInvoiceState?: "Not invoiced" | "Open" | null;
    feePaidAt: Date | null;
    mediaPaidAt: Date | null;
  }[];
  campaigns: DeskCampaign[];
  /** Up to five featured homes, so a row is recognizable by its listings. */
  featuredHomes: { id: string; name: string; photo: string | null }[];
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
      wanderOsWebsiteId: true,
      wanderOsCheckedAt: true,
      website: true,
      relationship: true,
      brandMark: true,
      connectToken: true,
      businessStage: true,
      businessStageAt: true,
      deliveryStage: true,
      deliveryStageAt: true,
      performanceSettings: true,
    },
    with: {
      owner: { columns: { id: true, name: true, image: true } },
      csLead: { columns: { id: true, name: true, image: true } },
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

  const [campaignRows, accounts, homeRows] = await Promise.all([
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
        performanceCycleId: true,
      },
      with: {
        ads: {
          columns: { id: true, status: true },
          // Only the first card's image, not the whole ad document.
          extras: {
            thumb: sql<
              string | null
            >`coalesce(content -> 'media' -> 0 ->> 'thumbnail', content -> 'media' -> 0 ->> 'url')`.as(
              "thumb",
            ),
          },
        },
      },
      orderBy: (campaign, { desc }) => [desc(campaign.createdAt)],
    }),
    db.query.performanceAccountTable.findMany({
      where: and(
        inArray(performanceAccountTable.brandId, brandIds),
        isNull(performanceAccountTable.deletedAt),
      ),
      columns: {
        id: true,
        brandId: true,
        status: true,
        plan: true,
        monthlyFee: true,
        agreedAdSpend: true,
        effectiveDate: true,
        endDate: true,
        terms: true,
      },
    }),
    db.query.homeTable.findMany({
      where: and(
        inArray(homeTable.brandId, brandIds),
        isNull(homeTable.deletedAt),
        inPrimaryGroup(homeTable.id),
      ),
      columns: { id: true, brandId: true, name: true, heroSourceUrl: true },
      orderBy: (home, { asc }) => [asc(home.name)],
    }),
  ]);
  const homesByBrand = new Map<string, DeskBrand["featuredHomes"]>();
  for (const home of homeRows) {
    const list = homesByBrand.get(home.brandId) ?? [];
    if (list.length < 5)
      list.push({ id: home.id, name: home.name, photo: home.heroSourceUrl });
    homesByBrand.set(home.brandId, list);
  }
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
          clientMediaContribution: true,
          feeInvoiceState: true,
          mediaInvoiceState: true,
          feePaidAt: true,
          mediaPaidAt: true,
          actualSpendCents: true,
        },
      })
    : [];
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
      approvedCount: campaign.ads.filter((ad) => ad.status === "approved")
        .length,
      thumbs: campaign.ads
        .map((ad) => ad.thumb)
        .filter((url): url is string => Boolean(url))
        .slice(0, 6),
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
      const cycle = account
        ? cycleRows.find(
            (cycle) =>
              cycle.accountId === account.id &&
              cycle.period ===
                (brand.performanceSettings?.cardState?.billingPeriod ??
                  currentPeriod()),
          )
        : undefined;
      const paymentSettings = projectPaymentSettings(
        brand.performanceSettings,
        cycle,
      );
      const billing: BillingSummary | null = cycle
        ? {
            period: cycle.period,
            fee: { amount: cycle.billedAmount, paidAt: cycle.feePaidAt },
            media: {
              amount: cycle.clientMediaContribution,
              paidAt: cycle.mediaPaidAt,
            },
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
        delivery: brand.deliveryStage ?? "not_started",
        pipelineStage: brand.performanceSettings?.pipelineStage,
        settings: paymentSettings,
        deliveryAt: brand.deliveryStageAt,
        lead: brand.owner,
        csLead: brand.csLead,
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
        logo: brand.logo,
        wanderOsWebsiteId: brand.wanderOsWebsiteId,
        wanderOsCheckedAt: brand.wanderOsCheckedAt,
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
        featuredHomes: homesByBrand.get(brand.id) ?? [],
        billing,
        billingCycles: account
          ? cycleRows.filter((row) => row.accountId === account.id)
          : [],
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

export { deskMoney } from "@/lib/performance-desk";
