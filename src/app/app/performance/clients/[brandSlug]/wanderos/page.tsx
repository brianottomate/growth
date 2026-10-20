import { HomeGroupsWorkspace } from "@/app/app/brands/[brandSlug]/homes/HomeGroupsWorkspace";
import { DestinationsCard } from "../DestinationsCard";
import { SeedListsCard } from "../SeedListsCard";
import { listSeedDeliveries } from "@/server/services/seeds/delivery";
import { emailListCounts } from "@/server/services/email-list.service";
import { db } from "@/server/db";
import { and, eq, isNull } from "drizzle-orm";
import { emailListTable, personaTable } from "@/server/db/schema";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  listAllBrandHomes,
  listBrandHomes,
} from "@/server/services/homes.service";
import {
  AllHomesCard,
  ManualHomesCard,
  WanderOsConnectionCard,
} from "./WanderOsCards";
import { type PickedHome } from "../PickedHomes";
import { brandTabHref, loadPerformanceBrand } from "../_data";

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

  const [rows, committed, seeds, personas, emailLists] = await Promise.all([
    listAllBrandHomes(brand.id),
    listBrandHomes(brand.id),
    listSeedDeliveries(
      { brandId: brand.id },
      { organizationId: org.id, userId: session.user.id },
    ),
    db.query.personaTable.findMany({
      where: and(
        eq(personaTable.brandId, brand.id),
        isNull(personaTable.deletedAt),
      ),
      columns: { id: true, name: true },
    }),
    db.query.emailListTable.findMany({
      where: eq(emailListTable.brandId, brand.id),
      columns: { id: true, name: true },
    }),
  ]);
  const counts = await emailListCounts(emailLists.map((list) => list.id));
  const slug = brand.slug ?? brand.id;
  const connected = Boolean(brand.wanderOsEnabled && brand.wanderOsWebsiteId);
  const hasImportedHomes = rows.some((home) => home.source === "wanderos");
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
      {!hasImportedHomes && (
        <WanderOsConnectionCard
          brandId={brand.id}
          brandSlug={slug}
          website={brand.website}
          connected={connected}
          checked={Boolean(brand.wanderOsCheckedAt)}
        />
      )}
      {hasImportedHomes && (
        <>
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
          <SeedListsCard
            brandName={brand.name}
            seeds={seeds}
            context={{
              brandId: brand.id,
              hasBookingSite: Boolean(brand.wanderOsWebsiteId),
              hasHomes: rows.length > 0,
              personas,
              emailLists: emailLists.map((list) => ({
                ...list,
                memberCount: counts.get(list.id) ?? 0,
              })),
            }}
          />
          <AllHomesCard
            brandId={brand.id}
            connected={connected}
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
        </>
      )}
      <ManualHomesCard
        brandId={brand.id}
        brandSlug={slug}
        website={brand.website}
        connected={connected}
        homes={rows
          .filter((home) => home.source === "manual")
          .map((home) => ({
            id: home.id,
            name: home.name,
            facts: factsOf(home),
          }))}
      />
    </div>
  );
}
