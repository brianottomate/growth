import "server-only";
import { currentPeriod } from "@/lib/performance-billing";

import { and, eq, desc, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandTable,
  performanceCycleTable,
  platformCampaignTable,
} from "@/server/db/schema";
import { costPerBooking } from "@/lib/performance-settings";

import { loadPerformanceDesk, narrowDesk } from "./performance-desk.service";
import { loadBrandReadiness } from "./performance-readiness.service";

/**
 * One client per row, the tracker sheet's columns in its order. Every cell
 * reads what the client's Settings tab reads, so the two cannot disagree:
 * money from the newest cycle before the contract, access from the intake,
 * campaigns from the desk, and the rest from `performanceSettings`.
 */
export type TrackerRow = {
  brandId: string;
  name: string;
  slug: string | null;
  business: string;
  fee: number | null;
  effectiveDate: string | null;
  terms: string | null;
  endDate: string | null;
  siteLive: string | null;
  agreedAdSpend: number | null;
  /** Whole dollars the platforms report spent. */
  spent: number;
  onboardingLink: string | null;
  fb: "verified" | "claimed" | "none";
  creative: { label: string; url: string }[];
  adCopiesUrl: string | null;
  adsLive: "live" | "paused" | "draft" | "none";
  cpb: number | null;
  newsletter: string | null;
  influencer: string | null;
  socialMediaPosts: string | null;
  bookings: number | null;
};

export async function loadPerformanceTracker(
  organizationId: string,
): Promise<TrackerRow[]> {
  const desk = narrowDesk(await loadPerformanceDesk(organizationId), "client");
  if (desk.brands.length === 0) return [];
  const brandIds = desk.brands.map((brand) => brand.id);
  const accountIds = desk.brands.flatMap((brand) =>
    brand.account ? [brand.account.id] : [],
  );
  const campaignIds = desk.brands.flatMap((brand) =>
    brand.campaigns.map((campaign) => campaign.id),
  );

  const [settingsRows, cycles, platformRows, readiness] = await Promise.all([
    db.query.brandTable.findMany({
      where: inArray(brandTable.id, brandIds),
      columns: { id: true, performanceSettings: true },
    }),
    accountIds.length
      ? db.query.performanceCycleTable.findMany({
          where: and(
            inArray(performanceCycleTable.accountId, accountIds),
            eq(performanceCycleTable.period, currentPeriod()),
          ),
          orderBy: desc(performanceCycleTable.period),
          columns: { accountId: true, billedAmount: true, mediaBudget: true },
        })
      : Promise.resolve([]),
    campaignIds.length
      ? db.query.platformCampaignTable.findMany({
          where: inArray(platformCampaignTable.campaignId, campaignIds),
          columns: { campaignId: true, stats: true },
        })
      : Promise.resolve([]),
    loadBrandReadiness(desk.brands),
  ]);

  const settingsOf = new Map(
    settingsRows.map((row) => [row.id, row.performanceSettings ?? null]),
  );
  // Newest first, so the first cycle seen per account is the current one.
  const cycleOf = new Map<string, (typeof cycles)[number]>();
  for (const cycle of cycles) {
    if (!cycleOf.has(cycle.accountId)) cycleOf.set(cycle.accountId, cycle);
  }
  const conversionsOf = new Map<string, number>();
  for (const row of platformRows) {
    if (!row.campaignId) continue;
    conversionsOf.set(
      row.campaignId,
      (conversionsOf.get(row.campaignId) ?? 0) + (row.stats?.conversions ?? 0),
    );
  }

  return desk.brands.map((brand): TrackerRow => {
    const settings = brand.settings ?? settingsOf.get(brand.id) ?? null;
    const cycle = brand.account ? cycleOf.get(brand.account.id) : undefined;
    const intake = readiness.get(brand.id)?.intake ?? null;
    const spent = brand.campaigns.reduce((sum, c) => sum + c.spend, 0);
    const platformBookings = brand.campaigns.reduce(
      (sum, c) => sum + (conversionsOf.get(c.id) ?? 0),
      0,
    );
    const bookings =
      platformBookings > 0 ? platformBookings : (settings?.bookings ?? null);
    const creative = [
      { label: "Catalog", url: settings?.catalogCreativeUrl },
      { label: "Carousel", url: settings?.carouselCreativeUrl },
      { label: "Hero", url: settings?.heroCreativeUrl },
    ].flatMap((row) => (row.url ? [{ label: row.label, url: row.url }] : []));
    return {
      brandId: brand.id,
      name: brand.name,
      slug: brand.slug,
      business: brand.business,
      fee: cycle?.billedAmount ?? settings?.monthlyFee ?? null,
      effectiveDate: settings?.effectiveDate ?? null,
      terms: settings?.terms ?? null,
      endDate: settings?.endDate ?? null,
      siteLive: settings?.siteLive ?? null,
      agreedAdSpend:
        settings?.agreedAdSpend ?? cycle?.mediaBudget ?? intake?.budget ?? null,
      spent,
      onboardingLink: brand.intakeUrl,
      fb: intake?.accessVerified
        ? "verified"
        : intake?.accessClaimed
          ? "claimed"
          : "none",
      creative,
      adCopiesUrl: settings?.adCopiesUrl ?? null,
      adsLive:
        brand.best === "live"
          ? "live"
          : brand.best === "pushed"
            ? "paused"
            : brand.best === "draft"
              ? "draft"
              : "none",
      cpb: costPerBooking(spent, bookings),
      newsletter: settings?.dedicatedNewsletter ?? null,
      influencer: settings?.influencer ?? null,
      socialMediaPosts: settings?.socialMediaPosts ?? null,
      bookings,
    };
  });
}
