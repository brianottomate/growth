import "server-only";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { and, eq, isNull } from "drizzle-orm";
export async function metaTrackingDefaults(brandId: string, accountId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(eq(brandTable.id, brandId), isNull(brandTable.deletedAt)),
  });
  if (!brand) return undefined;
  const own = brand.performanceSettings?.metaTrackingDefaults?.[accountId];
  if (own) return own;
  const ownerId = brand.performanceSettings?.adsConnectionBrandId;
  if (!ownerId || !brand.organizationId) return undefined;
  const owner = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, ownerId),
      eq(brandTable.organizationId, brand.organizationId),
      isNull(brandTable.deletedAt),
    ),
  });
  return owner?.performanceSettings?.metaTrackingDefaults?.[accountId];
}
