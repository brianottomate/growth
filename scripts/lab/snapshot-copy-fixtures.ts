import { writeFile } from "node:fs/promises";

import { and, desc, eq, isNull } from "drizzle-orm";

import { brandWideAmenities } from "../../src/lib/catalog-copy";
import type {
  CopyLabBrand,
  CopyLabFixtures,
  CopyLabHome,
} from "../../src/lib/copy-lab";
import { marketOf } from "../../src/lib/markets";
import { fetchWanderOsListingDetail } from "../../src/server/clients/wanderos-site.client";
import { db } from "../../src/server/db";
import { brandTable, homeTable } from "../../src/server/db/schema";

// Freezes real brands and homes into fixtures/copy/fixtures.json for the copy
// lab (/lab/copy). Read-only against the database and the WanderOS feed.
//
//   bun --conditions=react-server scripts/lab/snapshot-copy-fixtures.ts

const BRANDS = [
  "chalets-hh",
  "hollyhock-suites",
  "30a-beach-stays",
  "ar-vacations",
  "winter-park-escapes",
  "legacy-rnr",
];
const HOMES_PER_BRAND = 3;
const PHOTOS = 32;

const brands: CopyLabBrand[] = [];
const homes: CopyLabHome[] = [];

for (const slug of BRANDS) {
  const brand = await db.query.brandTable.findFirst({
    where: and(eq(brandTable.slug, slug), isNull(brandTable.deletedAt)),
  });
  if (!brand) throw new Error(`No brand ${slug}`);
  const rows = await db
    .select()
    .from(homeTable)
    .where(and(eq(homeTable.brandId, brand.id), isNull(homeTable.deletedAt)))
    .orderBy(desc(homeTable.featured), homeTable.name);
  // Featured homes first, one with an approved headline when the brand has any.
  const approvedRows = rows.filter((r) => r.catalogApproval && r.catalogTitle);
  const picked = [
    ...new Map(
      [...approvedRows.slice(0, 1), ...rows]
        .filter((r) => r.description)
        .map((r) => [r.id, r]),
    ).values(),
  ].slice(0, HOMES_PER_BRAND);
  const market = brand.markets?.markets[0] ?? null;
  brands.push({
    id: slug,
    name: brand.name,
    website: brand.website,
    story: brand.story,
    fingerprint: brand.brandFingerprint?.fingerprintText ?? null,
    personality: brand.brandIdentity?.personality ?? null,
    place: market?.label ?? null,
    brandWide: brandWideAmenities(rows),
    approved: approvedRows
      .slice(0, 12)
      .map((r) => ({ homeId: r.externalId, headline: r.catalogTitle! })),
  });
  for (const row of picked) {
    const detail = brand.wanderOsWebsiteId
      ? await fetchWanderOsListingDetail({
          websiteId: brand.wanderOsWebsiteId,
          propertyId: row.externalId,
        })
      : null;
    homes.push({
      id: row.externalId,
      brandId: slug,
      name: row.name,
      place: [row.city, row.state].filter(Boolean).join(", "),
      city: row.city,
      market: marketOf(brand.markets, row.city),
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      guests: row.guests,
      nightlyFrom: row.nightlyFrom,
      amenities: row.amenities ?? detail?.amenities ?? [],
      description: row.description ?? detail?.description ?? null,
      locationDescription: detail?.locationDescription ?? null,
      petsAllowed: detail?.petsAllowed ?? null,
      heroUrl: row.heroSourceUrl ?? detail?.photos[0]?.url ?? null,
      photos: (detail?.photos ?? []).slice(0, PHOTOS).map((p) => ({
        url: p.url,
        thumbUrl: p.thumbUrl ?? null,
      })),
      catalog: {
        title: row.catalogTitle,
        pills: row.catalogPills,
        templateId: row.catalogTemplateId,
        approved: Boolean(row.catalogApproval),
      },
    });
    console.log(`${slug}: ${row.name}`);
  }
}

const fixtures: CopyLabFixtures = {
  snapshotAt: new Date().toISOString(),
  brands,
  homes,
};
await writeFile(
  "fixtures/copy/fixtures.json",
  `${JSON.stringify(fixtures, null, 2)}\n`,
);
console.log(`${brands.length} brands, ${homes.length} homes`);
process.exit(0);
