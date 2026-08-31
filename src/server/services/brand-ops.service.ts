import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  adAccountTable,
  adSpotTable,
  audienceTable,
  brandTable,
  campaignTable,
  channelTable,
  contentPostTable,
  mediaAssetTable,
  partnerProgramTable,
  performanceAccountTable,
  platformCampaignTable,
  type Brand,
  type BrandWebsiteMeta,
  type brandTypeEnum,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import {
  deleteZernioAccount,
  deleteZernioProfile,
  isZernioConfigured,
  listZernioAccounts,
} from "@/server/clients/zernio.client";
import { newConnectToken } from "@/server/services/brand-connect.service";
import { MediaService } from "@/server/services/media.service";
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

// ---- BRAND PURGE: offboarding ------------------------------------------
//
// `brand.delete` only stamps deletedAt, which hides a brand without freeing
// its slug or removing anything under it. That is the right default for a
// mistake; it is the wrong answer when a client leaves and asks for their
// data to be removed. This is the hard path: every row, the provider
// connection, and the stored bytes.

/**
 * Why a purge is refused, if it is.
 *
 * Performance+ cycles and partner programs are money records rather than
 * marketing data, and both are RESTRICT/NO ACTION at the foreign key, so the
 * delete would fail regardless. Refusing with a reason beats a constraint
 * error. Pure so the rule can be tested without a database.
 */
export function purgeBlockers(counts: {
  performance_accounts: number;
  partner_programs: number;
}): string[] {
  const blockers: string[] = [];
  if (counts.performance_accounts > 0) {
    blockers.push(
      `${counts.performance_accounts} Performance+ account(s): billed cycles are financial history, so detach or archive them first.`,
    );
  }
  if (counts.partner_programs > 0) {
    blockers.push(
      `${counts.partner_programs} partner program(s) still reference this brand.`,
    );
  }
  return blockers;
}

/** The typed confirmation. Exact match, whitespace forgiven. */
export function purgeConfirmationMatches(
  brandName: string,
  confirmName: string,
): boolean {
  return confirmName.trim() === brandName;
}

/** What a purge would destroy, and anything that stops it. */
export async function previewBrandPurge(brandId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
    columns: {
      id: true,
      name: true,
      slug: true,
      organizationId: true,
      zernioProfileId: true,
    },
  });
  if (!brand) throw new Error("That brand no longer exists.");
  if (!brand.organizationId) {
    throw new Error(
      "Only owned brands can be purged. Use untrack for a reference brand.",
    );
  }

  const result = await db.execute<{
    channels: number;
    campaigns: number;
    platform_campaigns: number;
    ad_spots: number;
    audiences: number;
    content_posts: number;
    media_assets: number;
    ad_accounts: number;
    performance_accounts: number;
    partner_programs: number;
  }>(sql`
    select
      (select count(*) from ${channelTable} where brand_id = ${brand.id})::int as channels,
      (select count(*) from ${campaignTable} where brand_id = ${brand.id})::int as campaigns,
      (select count(*) from ${platformCampaignTable} where brand_id = ${brand.id})::int as platform_campaigns,
      (select count(*) from ${adSpotTable} where brand_id = ${brand.id})::int as ad_spots,
      (select count(*) from ${audienceTable} where brand_id = ${brand.id})::int as audiences,
      (select count(*) from ${contentPostTable} where brand_id = ${brand.id})::int as content_posts,
      (select count(*) from ${mediaAssetTable} where brand_id = ${brand.id})::int as media_assets,
      (select count(*) from ${adAccountTable} where brand_id = ${brand.id})::int as ad_accounts,
      (select count(*) from ${performanceAccountTable} where brand_id = ${brand.id})::int as performance_accounts,
      (select count(*) from ${partnerProgramTable} where brand_id = ${brand.id})::int as partner_programs
  `);
  const counts = result.rows[0]!;

  return { brand, counts, blockers: purgeBlockers(counts) };
}

/**
 * Hard-delete a brand: its rows, its Zernio connection, and its stored bytes.
 *
 * `confirmName` must match the brand's name. Thirty-seven foreign keys cascade
 * off this row, so the operator types the name rather than clicking once.
 *
 * Order matters. Media bytes are swept BEFORE the cascade, because the R2 keys
 * live on rows the cascade destroys. Ad-account rows go next because that FK is
 * RESTRICT and would otherwise block the delete. The provider disconnect is
 * last of the external steps and is best-effort: a failure there must not leave
 * the database half-deleted, so it is reported rather than thrown.
 */
export async function purgeBrand(input: {
  brandId: string;
  confirmName: string;
}) {
  const { brand, counts, blockers } = await previewBrandPurge(input.brandId);
  if (blockers.length) {
    throw new Error(`Cannot purge ${brand.name}: ${blockers.join(" ")}`);
  }
  if (!purgeConfirmationMatches(brand.name, input.confirmName)) {
    throw new Error(
      `Type the brand name exactly to confirm. Expected "${brand.name}".`,
    );
  }

  const warnings: string[] = [];

  // 1. Stored bytes, while the rows that name them still exist.
  const media = await db.query.mediaAssetTable.findMany({
    where: eq(mediaAssetTable.brandId, brand.id),
    columns: { id: true },
  });
  let mediaDeleted = 0;
  for (const asset of media) {
    try {
      await MediaService.delete(asset.id);
      mediaDeleted++;
    } catch (error) {
      warnings.push(`media ${asset.id}: ${errorText(error)}`);
    }
  }

  // 2. The provider connection. Accounts first: deleting a profile does not
  //    cascade to them, and an orphaned account stays authorised.
  let accountsDisconnected = 0;
  let profileDeleted = false;
  if (brand.zernioProfileId && isZernioConfigured) {
    try {
      const accounts = await listZernioAccounts();
      const mine = accounts.filter((account) => {
        const profile = account.profileId;
        const id = typeof profile === "string" ? profile : profile?._id;
        return id === brand.zernioProfileId;
      });
      for (const account of mine) {
        const id = account._id ?? account.id;
        if (!id) continue;
        await deleteZernioAccount(id);
        accountsDisconnected++;
      }
      await deleteZernioProfile(brand.zernioProfileId);
      profileDeleted = true;
    } catch (error) {
      warnings.push(`zernio: ${errorText(error)}`);
    }
  }

  // 3. The RESTRICT blocker, then the row that cascades everything else.
  await db.delete(adAccountTable).where(eq(adAccountTable.brandId, brand.id));
  await db.delete(brandTable).where(eq(brandTable.id, brand.id));

  return {
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    deleted: counts,
    mediaDeleted,
    accountsDisconnected,
    profileDeleted,
    warnings,
  };
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
