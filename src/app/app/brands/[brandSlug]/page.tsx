import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { desc, eq as eqOp } from "drizzle-orm";

import { db } from "@/server/db";
import {
  adSpotTable,
  brandInspirationTable,
  brandTable,
  memberTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { getBrandStrategy } from "@/server/services/cadence.service";
import { getBrandSurfaceSummary } from "@/server/services/brand-map.service";
import { PILLARS } from "@/lib/pillars";
import { ContentStructureAssistantButton } from "@/components/content-structure-assistant-button";

import { BrandStrategyClient } from "./BrandStrategyClient";
import { BrandSurfaceMap } from "./BrandSurfaceMap";

export const dynamic = "force-dynamic";

/**
 * /app/brands/[brandSlug] — the brand strategy cockpit. Reflects the status quo
 * (observed cadence + pillar mix from our own history) alongside competitor
 * benchmarks, and lets you SET the targets that fan out to /channels, the brand
 * card, and (later) the /plan slot generator.
 */
export default async function BrandPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) notFound();

  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.slug, brandSlug),
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, slug: true, type: true },
  });
  if (!brand) notFound();

  // Tracked peers (competitors + inspiration) → competitor benchmark.
  const inspirations = await db.query.brandInspirationTable.findMany({
    where: eq(brandInspirationTable.brandId, brand.id),
    columns: { inspirationBrandId: true },
  });
  const peerBrandIds = inspirations.map((i) => i.inspirationBrandId);

  const strategy = await getBrandStrategy(brand.id, { peerBrandIds });

  const surfaceSummary = await getBrandSurfaceSummary(brand.id, {
    peers: strategy.peerBrandCount,
    hasStrategyTargets: strategy.hasTargets,
  });

  // Latest synced ads across the brand's allowed ad accounts — an overview
  // strip only; management lives on the ads pages.
  const latestSpots = await db.query.adSpotTable.findMany({
    where: eqOp(adSpotTable.brandId, brand.id),
    orderBy: [desc(adSpotTable.createdAt)],
    limit: 12,
  });
  const spotCampaignIds = [
    ...new Set(
      latestSpots
        .map((spot) => spot.platformCampaignId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const spotCampaigns =
    spotCampaignIds.length > 0
      ? await db.query.platformCampaignTable.findMany({
          where: (table, { inArray }) => inArray(table.id, spotCampaignIds),
          columns: { id: true, name: true },
        })
      : [];
  const campaignName = new Map(spotCampaigns.map((row) => [row.id, row.name]));

  // Pillars available to target for this brand (by slug), for the "add" menu.
  const pillars = PILLARS.filter(
    (p) => p.brandSlug === brand.slug || p.brandSlug === "wander",
  ).map((p) => ({ slug: p.slug, name: p.name }));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/app/brands"
            className="text-muted-foreground hover:underline"
          >
            Brands
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{brand.name}</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">
            {brand.name}{" "}
            <span className="text-muted-foreground text-base font-normal">
              brand map
            </span>
          </h1>
          <div className="flex items-center gap-3 text-sm">
            <ContentStructureAssistantButton
              brandId={brand.id}
              brandName={brand.name}
              source="brand"
            />
            <Link
              href={`/app/brands/${brand.slug}/ads`}
              className="text-muted-foreground hover:underline"
            >
              Ads
            </Link>
            <Link
              href={`/app/brands/${brand.slug}/setup`}
              className="text-muted-foreground hover:underline"
            >
              Setup
            </Link>
            <Link
              href="/app/channels"
              className="text-muted-foreground hover:underline"
            >
              All channels
            </Link>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          A shared view of what the workspace knows, how it is structured, and
          what needs human attention. Activity is observed over the last{" "}
          {strategy.windowDays} days
          {strategy.peerBrandCount > 0
            ? ` · benchmarked against ${strategy.peerBrandCount} tracked ${
                strategy.peerBrandCount === 1 ? "brand" : "brands"
              }`
            : " · no peer data yet"}
          .
        </p>
      </header>

      <BrandSurfaceMap brandId={brand.id} summary={surfaceSummary} />

      {latestSpots.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-base font-semibold">Latest ads</h2>
              <p className="text-muted-foreground mt-0.5 text-sm">
                The most recently synced ads across this brand&apos;s accounts.
              </p>
            </div>
            <Link
              href={`/app/brands/${brandSlug}/ads`}
              className="text-muted-foreground text-sm hover:underline"
            >
              All ads
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {latestSpots.map((spot) => (
              <Link
                key={spot.id}
                href={
                  spot.platformCampaignId
                    ? `/app/brands/${brandSlug}/ads/${spot.platformCampaignId}`
                    : `/app/brands/${brandSlug}/ads`
                }
                className="bg-card w-40 shrink-0 overflow-hidden rounded-xl border transition-colors hover:border-white/20"
              >
                <div className="bg-muted relative h-24">
                  {(spot.media?.[0]?.url ?? spot.thumbnailUrl) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={spot.media?.[0]?.url ?? spot.thumbnailUrl ?? ""}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                  {spot.status && (
                    <span className="absolute top-1 right-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-medium text-white capitalize backdrop-blur-sm">
                      {spot.status}
                    </span>
                  )}
                </div>
                <div className="p-2">
                  <p className="truncate text-xs font-medium">
                    {spot.name ?? "Untitled ad"}
                  </p>
                  <p className="text-muted-foreground truncate text-[10px]">
                    {(spot.platformCampaignId
                      ? campaignName.get(spot.platformCampaignId)
                      : null) ?? spot.platform}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section id="strategy" className="scroll-mt-6 space-y-3">
        <div>
          <h2 className="text-base font-semibold">Strategy and cadence</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Compare observed behavior with the structure the team wants AI to
            plan against.
          </p>
        </div>
        <BrandStrategyClient
          brandId={brand.id}
          strategy={strategy}
          pillars={pillars}
        />
      </section>
    </div>
  );
}
