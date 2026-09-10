import { and, eq, isNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import {
  hotelFeedCsv,
  hotelFeedRows,
  hotelFeedXml,
} from "@/lib/meta-hotel-feed";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { brandListings } from "@/server/services/wanderos-listings.service";

export const dynamic = "force-dynamic";

/**
 * A brand's homes as a Meta hotel catalog feed, downloaded as CSV or XML.
 * Session-gated the way the app pages are: the caller must belong to the
 * brand's organization. The file is written from the live WanderOS feed, so
 * it is as current as their site.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { brandId } = await params;
  const format =
    request.nextUrl.searchParams.get("format") === "xml" ? "xml" : "csv";

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    columns: { organizationId: true },
  });
  const brand = membership
    ? await db.query.brandTable.findFirst({
        where: and(
          eq(brandTable.id, brandId),
          eq(brandTable.organizationId, membership.organizationId),
          isNull(brandTable.deletedAt),
        ),
        columns: { id: true, name: true, slug: true, website: true },
      })
    : null;
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const homes = await brandListings({ id: brand.id, website: brand.website });
  const rows = hotelFeedRows(homes, brand.name);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${brand.slug ?? brand.id}-hotel-catalog-${stamp}.${format}`;
  const body =
    format === "xml" ? hotelFeedXml(rows, brand.name) : hotelFeedCsv(rows);

  return new NextResponse(body, {
    headers: {
      "Content-Type":
        format === "xml"
          ? "application/xml; charset=utf-8"
          : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
