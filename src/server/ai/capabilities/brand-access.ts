import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandInspirationTable, brandTable } from "@/server/db/schema";
import type { CapabilityContext } from "./types";

export async function requireOwnedBrand(
  brandId: string,
  ctx: CapabilityContext,
) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, ctx.orgId),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand) throw new Error("That owned brand is not in your organization.");
  return brand;
}

/** Owned brands plus reference brands explicitly tracked by this organization. */
export async function requireVisibleBrand(
  brandId: string,
  ctx: CapabilityContext,
) {
  const brand = await db.query.brandTable.findFirst({
    where: and(eq(brandTable.id, brandId), isNull(brandTable.deletedAt)),
  });
  if (!brand) throw new Error("Brand not found.");
  if (brand.organizationId === ctx.orgId) return brand;
  if (brand.organizationId)
    throw new Error("That brand is outside your organization.");

  const [tracked] = await db
    .select({ id: brandInspirationTable.id })
    .from(brandInspirationTable)
    .innerJoin(brandTable, eq(brandTable.id, brandInspirationTable.brandId))
    .where(
      and(
        eq(brandInspirationTable.inspirationBrandId, brandId),
        eq(brandTable.organizationId, ctx.orgId),
        isNull(brandTable.deletedAt),
      ),
    )
    .limit(1);
  if (!tracked)
    throw new Error(
      "That reference brand is not tracked by your organization.",
    );
  return brand;
}
