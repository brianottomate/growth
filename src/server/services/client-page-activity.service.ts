import "server-only";
import { and, eq, isNull, isNotNull, sql, count, min, max } from "drizzle-orm";
import { db } from "@/server/db";
import { brandTable, clientPageViewTable } from "@/server/db/schema";
import {
  clientPageViewSchema,
  type ClientPageSurface,
} from "@/lib/client-page-activity";
import { getBrandByConnectToken } from "./brand-connect.service";
import { resolveEmailDnsLink } from "./email-dns.service";

/** Re-resolve the live resource at write time; a caller cannot choose another brand's ID. */
export async function recordClientPageView(input: {
  surface: ClientPageSurface;
  handle: string;
  visitId: string;
}) {
  const parsed = clientPageViewSchema.parse(input);
  let brandId: string | undefined;
  if (parsed.surface === "email_dns") {
    brandId = (await resolveEmailDnsLink(parsed.handle))?.brand.id;
  } else if (parsed.surface === "social_connect") {
    brandId = (await getBrandByConnectToken(parsed.handle))?.id;
  } else {
    const brand = await db.query.brandTable.findFirst({
      where: and(
        isNull(brandTable.deletedAt),
        isNotNull(brandTable.organizationId),
        parsed.surface === "pitch"
          ? eq(brandTable.slug, parsed.handle)
          : sql`(${brandTable.slug} = ${parsed.handle} or ${brandTable.connectToken} = ${parsed.handle})`,
      ),
      columns: { id: true },
    });
    brandId = brand?.id;
  }
  if (!brandId) return null;
  await db
    .insert(clientPageViewTable)
    .values({ brandId, surface: parsed.surface, visitId: parsed.visitId })
    .onConflictDoNothing();
  return { ok: true };
}
export async function getClientPageActivity(brandId: string, orgId: string) {
  return db
    .select({
      surface: clientPageViewTable.surface,
      views: count(),
      firstViewedAt: min(clientPageViewTable.viewedAt),
      lastViewedAt: max(clientPageViewTable.viewedAt),
    })
    .from(clientPageViewTable)
    .innerJoin(brandTable, eq(brandTable.id, clientPageViewTable.brandId))
    .where(
      and(
        eq(brandTable.id, brandId),
        eq(brandTable.organizationId, orgId),
        isNull(brandTable.deletedAt),
      ),
    )
    .groupBy(clientPageViewTable.surface);
}
