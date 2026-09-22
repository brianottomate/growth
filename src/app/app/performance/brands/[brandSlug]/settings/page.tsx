import { SharedAdsConnections } from "@/app/app/brands/[brandSlug]/SharedAdsConnections";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { platformCampaignTable } from "@/server/db/schema";
import type { SettingsDerived } from "@/lib/performance-settings";
import { loadBrandReadiness } from "@/server/services/performance-readiness.service";

import { SectionLabel } from "../../../_components";
import { loadPerformanceBrand } from "../_data";

import { SettingsCard } from "./SettingsCard";

export const metadata: Metadata = { title: "Settings · Wander Performance" };
export const dynamic = "force-dynamic";

/**
 * The client's settings, laid out as the tracker sheet's row. Derived facts
 * are read live; the settings themselves are the brand's `performanceSettings`,
 * written by the agent and filled from an applied intake.
 */
export default async function PerformanceBrandSettingsPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const { session, org, brand, deskBrand } =
    await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;
  if (!brand) notFound();

  const campaignIds = deskBrand?.campaigns.map((campaign) => campaign.id) ?? [];
  const [cycle, platformRows, readiness] = await Promise.all([
    deskBrand?.account
      ? db.query.performanceCycleTable.findFirst({
          where: (t, { eq }) => eq(t.accountId, deskBrand.account!.id),
          orderBy: (t, { desc }) => desc(t.period),
          columns: {
            billedAmount: true,
            mediaBudget: true,
            feePaidAt: true,
            mediaPaidAt: true,
          },
        })
      : Promise.resolve(null),
    campaignIds.length
      ? db.query.platformCampaignTable.findMany({
          where: inArray(platformCampaignTable.campaignId, campaignIds),
          columns: { stats: true, spend: true },
        })
      : Promise.resolve([]),
    deskBrand ? loadBrandReadiness([deskBrand]) : Promise.resolve(null),
  ]);
  const intake = deskBrand
    ? (readiness?.get(deskBrand.id)?.intake ?? null)
    : null;

  const derived: SettingsDerived = {
    paidFee: cycle?.billedAmount ?? null,
    feePaidAt: cycle?.feePaidAt ?? null,
    mediaPaidAt: cycle?.mediaPaidAt ?? null,
    // The intake's figure stands in until a cycle is opened, as on the checklist.
    mediaBudget: cycle?.mediaBudget ?? intake?.budget ?? null,
    actualSpend: Math.round(
      platformRows.reduce(
        (sum, row) => sum + (row.stats?.spend ?? row.spend ?? 0),
        0,
      ),
    ),
    onboardingLink: deskBrand?.intakeUrl ?? null,
    fbConnection: intake?.accessVerified
      ? "verified"
      : intake?.accessClaimed
        ? "claimed"
        : "none",
    adsLive:
      deskBrand?.best === "live"
        ? "live"
        : deskBrand?.best === "pushed"
          ? "paused"
          : deskBrand?.best === "draft"
            ? "draft"
            : "none",
    platformBookings: platformRows.reduce(
      (sum, row) => sum + (row.stats?.conversions ?? 0),
      0,
    ),
  };

  return (
    <div className="space-y-3">
      <SectionLabel>Settings</SectionLabel>
      <SharedAdsConnections brandId={brand.id} />
      <SettingsCard
        derived={derived}
        settings={brand.performanceSettings ?? null}
      />
    </div>
  );
}
