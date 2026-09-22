import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { brandTable, type Brand } from "@/server/db/schema";
/** Paid ads may explicitly borrow a same-organization brand's connection. */
export async function adsConnectionProfile(
  brand: Pick<
    Brand,
    "organizationId" | "zernioProfileId" | "performanceSettings"
  >,
) {
  const ownerId = brand.performanceSettings?.adsConnectionBrandId;
  if (!ownerId) return brand.zernioProfileId;
  if (!brand.organizationId) return null;
  const owner = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, ownerId),
      eq(brandTable.organizationId, brand.organizationId),
      isNull(brandTable.deletedAt),
    ),
    columns: { zernioProfileId: true },
  });
  return owner?.zernioProfileId ?? null;
}
