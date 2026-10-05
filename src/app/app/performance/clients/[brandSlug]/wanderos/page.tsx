import { HomeGroupsWorkspace } from "@/app/app/brands/[brandSlug]/homes/HomeGroupsWorkspace";
import { DestinationsCard } from "../DestinationsCard";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";
import { RefreshHomes } from "../RefreshHomes";
import {
  listAllBrandHomes,
  listBrandHomes,
} from "@/server/services/homes.service";

import { House, Link2, Unlink, CircleHelp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { HomeRowsGrid } from "../HomeRowsGrid";
import { AddHomesByHand } from "../AddHomesByHand";
import { type PickedHome } from "../PickedHomes";
import { brandTabHref, loadPerformanceBrand } from "../_data";
import { ButtonLink } from "@/components/ui/button";
import { PreparationAction } from "../PreparationAction";

export const metadata: Metadata = { title: "WanderOS · Wander Performance" };
export const dynamic = "force-dynamic";

/**
 * Every home on the client's record: browse them, feature the set the ads
 * run on. A brand with no feed
 * pastes its homes in by hand instead. This is where a signed client's homes
 * are set up; the catalog cards have their own tab.
 */
export default async function PerformanceWanderOsPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const { session, org, brand } = await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;
  if (!brand) notFound();

  const [rows, committed] = await Promise.all([
    listAllBrandHomes(brand.id),
    listBrandHomes(brand.id),
  ]);
  const slug = brand.slug ?? brand.id;
  const connected = Boolean(brand.wanderOsEnabled && brand.wanderOsWebsiteId);
  const connectionStatus = (
    <Badge variant={connected ? "secondary" : "outline"}>
      {connected ? (
        <Link2 />
      ) : brand.wanderOsCheckedAt ? (
        <Unlink />
      ) : (
        <CircleHelp />
      )}
      {connected
        ? "WanderOS connected"
        : brand.wanderOsCheckedAt
          ? "WanderOS not connected"
          : "WanderOS not checked"}
    </Badge>
  );
  if (!rows.length) {
    return (
      <section className="rounded-xl border p-6">
        <div className="mb-4">{connectionStatus}</div>
        <EmptyState
          icon={House}
          title={
            connected
              ? "Import homes when you’re ready"
              : brand.wanderOsCheckedAt
                ? "WanderOS is not connected"
                : "Check for a WanderOS website"
          }
          description={
            connected
              ? "Import the client’s WanderOS homes to prepare destinations, home groups, featured homes, and catalog cards."
              : "Check now, or return once the client’s WanderOS website is deployed. Checking the website does not import homes."
          }
          actions={
            connected ? (
              <RefreshHomes brandId={brand.id} label="Import homes" primary />
            ) : brand.website ? (
              <PreparationAction
                brandId={brand.id}
                kind="wanderos"
                label={
                  brand.wanderOsCheckedAt
                    ? "Recheck WanderOS"
                    : "Check WanderOS"
                }
              />
            ) : (
              <ButtonLink href={brandTabHref(slug, "settings")}>
                Add website
              </ButtonLink>
            )
          }
        />
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Add homes manually
          </summary>
          <AddHomesByHand
            brandId={brand.id}
            brandSlug={slug}
            brandWebsite={brand.website}
            homes={[]}
          />
        </details>
      </section>
    );
  }
  const inventoryHomes = rows;
  // Tiles draw the hero's gallery thumbnail, a fifth the weight of the file.
  const heroThumb = (home: {
    heroSourceUrl: string | null;
    galleryCache?: { url: string; thumbUrl: string }[] | null;
  }) =>
    home.galleryCache?.find((photo) => photo.url === home.heroSourceUrl)
      ?.thumbUrl ?? home.heroSourceUrl;
  const factsOf = (home: {
    bedrooms: number | null;
    guests: number | null;
    city: string | null;
    state: string | null;
  }) =>
    [
      home.bedrooms ? `${home.bedrooms} bd` : null,
      home.guests ? `${home.guests} guests` : null,
      [home.city, home.state].filter(Boolean).join(", ") || null,
    ]
      .filter(Boolean)
      .join(" · ");
  // The in-focus band shows each featured home from its row: ingestion
  // stored the full gallery on it.
  const pickedHomes: PickedHome[] = committed.map((home) => {
    const gallery = (home.galleryCache ?? []).map(
      (photo) => photo.thumbUrl || photo.url,
    );
    const images = (
      gallery.length > 0 ? gallery : [home.heroSourceUrl].filter(Boolean)
    ) as string[];
    return {
      id: home.id,
      externalId: home.externalId,
      source: home.source,
      name: home.name,
      hero: home.heroSourceUrl,
      images: images.slice(0, 12),
      photoCount: images.length,
      bedrooms: home.bedrooms,
      bathrooms: home.bathrooms,
      guests: home.guests,
      rating: home.rating,
      nightlyFrom: home.nightlyFrom,
      city: home.city,
      state: home.state,
      offFeed: false,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {connectionStatus}
        <PreparationAction
          brandId={brand.id}
          kind="wanderos"
          label="Recheck WanderOS"
        />
      </div>
      <HomeGroupsWorkspace
        brandId={brand.id}
        brandName={brand.name}
        brandSlug={slug}
        setupHref={`${brandTabHref(slug, "settings")}#wanderos`}
        featuredHomes={{
          brandId: brand.id,
          brandName: brand.name,
          brandSlug: slug,
          picked: pickedHomes,
        }}
        betweenSections={
          <DestinationsCard
            brandId={brand.id}
            brandName={brand.name}
            markets={brand.markets ?? null}
            towns={[
              ...inventoryHomes.reduce((counts, home) => {
                if (home.city)
                  counts.set(home.city, (counts.get(home.city) ?? 0) + 1);
                return counts;
              }, new Map<string, number>()),
            ].map(([town, homes]) => ({ town, homes }))}
          />
        }
      />
      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <House className="size-4 text-muted-foreground" />
            All homes
            {` · ${rows.length}`}
          </h2>
          <div className="flex items-center gap-2">
            <ButtonLink
              href={brandTabHref(slug, "catalog")}
              size="sm"
              variant="outline"
            >
              Continue to Catalog
            </ButtonLink>
          </div>
        </div>
        <HomeRowsGrid
          homes={rows.map((home) => ({
            id: home.id,
            externalId: home.externalId,
            name: home.name,
            url: home.url,
            heroThumbUrl: heroThumb(home),
            featured: home.featured,
            facts: factsOf(home),
          }))}
          brandSlug={slug}
        />
      </section>
    </div>
  );
}
