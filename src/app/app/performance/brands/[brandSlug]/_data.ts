import { workspaceActor } from "@/server/workspace-actor";
import "server-only";

import { cache } from "react";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandTable,
  mediaAssetTable,
  organizationTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { loadPerformanceDesk } from "@/server/services/performance-desk.service";

/**
 * What the brand layout and every tab under it need about the brand, read
 * once per request. React's `cache` dedupes the calls across the layout and
 * the page, so the tabs cost no more than the single page did.
 */
export const loadPerformanceBrand = cache(async (brandSlug: string) => {
  const session = await getSession();
  if (!session?.user)
    return { session: null, org: null, brand: null, deskBrand: null };
  const actor = await workspaceActor();
  const org = actor
    ? await db.query.organizationTable.findFirst({
        where: eq(organizationTable.id, actor.orgId),
      })
    : null;
  if (!org) return { session, org: null, brand: null, deskBrand: null };

  const [brand, desk] = await Promise.all([
    db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.slug, brandSlug),
        eq(brandTable.organizationId, org.id),
        isNull(brandTable.deletedAt),
      ),
      columns: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        website: true,
        leadDomain: true,
        featuredListingUrl: true,
        previewSourceUrl: true,
        story: true,
        relationship: true,
        brandIdentity: true,
        brandMark: true,
        connectTokenIssuedByName: true,
        connectTokenIssuedByEmail: true,
        performanceSettings: true,
      },
    }),
    loadPerformanceDesk(org.id),
  ]);
  const deskBrand = brand
    ? (desk.brands.find((row) => row.id === brand.id) ?? null)
    : null;
  return { session, org, brand: brand ?? null, deskBrand };
});

export type PerformanceBrand = NonNullable<
  Awaited<ReturnType<typeof loadPerformanceBrand>>["brand"]
>;

/**
 * The brand's mark as a URL for the feed mock: the traced vector draws
 * sharpest, the colour PNG is the fallback, and a brand with no mark shows
 * its logo.
 */
export const brandAvatarUrl = cache(
  async (brand: Pick<PerformanceBrand, "brandMark" | "logo">) => {
    if (!brand.brandMark) return brand.logo;
    if (brand.brandMark.vector?.color) {
      return `data:image/svg+xml;base64,${Buffer.from(brand.brandMark.vector.color).toString("base64")}`;
    }
    const asset = await db.query.mediaAssetTable.findFirst({
      where: eq(mediaAssetTable.id, brand.brandMark.variants.color),
      columns: { url: true },
    });
    return asset?.url ?? brand.logo;
  },
);

/** The tab paths under one brand. */
export function brandTabHref(
  slug: string,
  tab: "" | "setup" | "homes" | "catalog" | "ads" | "campaigns" | "settings",
) {
  return `/app/performance/brands/${slug}${tab ? `/${tab === "homes" ? "setup" : tab}` : ""}`;
}
