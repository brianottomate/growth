import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { brandTable, mediaAssetTable, memberTable } from "@/server/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { mediaId } = await params;
  const [asset] = await db
    .select({
      id: mediaAssetTable.id,
      url: mediaAssetTable.url,
      filename: mediaAssetTable.filename,
      mimeType: mediaAssetTable.mimeType,
      provider: mediaAssetTable.provider,
      organizationId: brandTable.organizationId,
    })
    .from(mediaAssetTable)
    .innerJoin(brandTable, eq(mediaAssetTable.brandId, brandTable.id))
    .where(
      and(eq(mediaAssetTable.id, mediaId), isNull(mediaAssetTable.deletedAt)),
    )
    .limit(1);

  if (!asset?.organizationId || asset.provider !== "r2" || !asset.url) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  const [membership] = await db
    .select({ id: memberTable.id })
    .from(memberTable)
    .where(
      and(
        eq(memberTable.userId, session.user.id),
        eq(memberTable.organizationId, asset.organizationId),
      ),
    )
    .limit(1);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const source = await fetch(asset.url);
  if (!source.ok || !source.body) {
    return NextResponse.json({ error: "Media unavailable" }, { status: 502 });
  }

  const filename = asset.filename || `${asset.id}.bin`;
  return new Response(source.body, {
    headers: {
      "Content-Type":
        asset.mimeType ||
        source.headers.get("content-type") ||
        "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
