import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandTable,
  type Brand,
  type BrandWebsiteMeta,
  type brandTypeEnum,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { newConnectToken } from "@/server/services/brand-connect.service";
import {
  enrichBrandFromWebsite,
  type BrandEnrichment,
} from "@/server/services/brand-enrichment.service";

// ---- BRAND OPS: create + enrich, shared by tRPC and chat/MCP ----------
//
// Creation and enrichment are separate operations on purpose: the dialog
// enriches BEFORE creating (preview → save), while an agent over MCP creates
// first and enriches second. Both compose from the same two functions.

/** URL with protocol; null for empties. */
export function normalizeWebsiteUrl(url?: string | null): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "brand"
  );
}

export type BrandEnrichmentValues = {
  tagline?: string | null;
  description?: string | null;
  logo?: string | null;
  websiteMeta?: BrandWebsiteMeta | null;
};

export async function createOwnedBrand(input: {
  organizationId: string;
  ownerId: string;
  name: string;
  website?: string | null;
  brandType?: (typeof brandTypeEnum.enumValues)[number];
  /** Pre-fetched enrichment (the dialog's preview) — saved inline. */
  enrichment?: BrandEnrichmentValues | null;
}): Promise<Brand> {
  const website = normalizeWebsiteUrl(input.website);

  let slug = slugify(input.name);
  const slugTaken = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.organizationId, input.organizationId),
      eq(brandTable.slug, slug),
    ),
  });
  if (slugTaken) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const [brand] = await db
    .insert(brandTable)
    .values({
      id: createId("brand"),
      organizationId: input.organizationId,
      ownerId: input.ownerId,
      type: input.brandType ?? "company",
      name: input.name,
      slug,
      website,
      // Owned brands are connectable from birth; the Zernio profile is
      // created lazily on the client's first Connect click.
      connectToken: newConnectToken(),
      ...(input.enrichment?.tagline && { tagline: input.enrichment.tagline }),
      ...(input.enrichment?.description && {
        description: input.enrichment.description,
      }),
      ...(input.enrichment?.logo && { logo: input.enrichment.logo }),
      ...(input.enrichment?.websiteMeta && {
        websiteMeta: input.enrichment.websiteMeta,
      }),
    })
    .returning();
  return brand!;
}

/**
 * Scrape the brand's website (or an override) and write the results onto the
 * row. Idempotent — re-running refreshes the same fields. Returns null when
 * the site could not be read.
 */
export async function enrichBrandById(
  brandId: string,
  websiteOverride?: string | null,
): Promise<{ brand: Brand; enrichment: BrandEnrichment } | null> {
  const existing = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
    columns: { id: true, website: true },
  });
  if (!existing) throw new Error("Brand not found");
  const website = normalizeWebsiteUrl(websiteOverride) ?? existing.website;
  if (!website) throw new Error("Add a website URL before enriching");

  const enrichment = await enrichBrandFromWebsite(website);
  if (!enrichment) return null;

  const [brand] = await db
    .update(brandTable)
    .set({
      website,
      ...(enrichment.tagline && { tagline: enrichment.tagline }),
      ...(enrichment.description && { description: enrichment.description }),
      ...(enrichment.logo && { logo: enrichment.logo }),
      websiteMeta: enrichment.websiteMeta,
    })
    .where(eq(brandTable.id, brandId))
    .returning();
  return { brand: brand!, enrichment };
}
