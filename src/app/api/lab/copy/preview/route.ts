import { NextResponse, type NextRequest } from "next/server";
import { eq, isNull, and } from "drizzle-orm";
import sharp from "sharp";
import { compositionPreviewFromParams } from "@/lib/compositions";
import { copyLabPreviewHome } from "@/lib/copy-lab";
import { assertLabAccess } from "@/server/lab-access";
import { copyLabFixtures } from "@/server/services/copy-lab.service";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import {
  loadCompositionSource,
  renderComposition,
} from "@/server/services/composition.service";

/** Lab-only, read-only production renders restricted to the frozen home photos. */
export async function GET(request: NextRequest) {
  const denied = await assertLabAccess(request);
  if (denied) return denied;
  const params = request.nextUrl.searchParams;
  const { parsed, sourceUrl } = compositionPreviewFromParams(params);
  const home = copyLabPreviewHome(copyLabFixtures, {
    brandId: params.get("brandId"),
    homeId: params.get("homeId"),
    sourceUrl,
    sourceMediaAssetId: params.get("sourceMediaAssetId") || undefined,
  });
  if (!parsed.success || !home || !sourceUrl) {
    return NextResponse.json(
      { error: "Choose a photo from this home fixture" },
      { status: 400 },
    );
  }
  try {
    const brand = await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.slug, home.brandId),
        isNull(brandTable.deletedAt),
      ),
      columns: {
        id: true,
        name: true,
        logo: true,
        brandMark: true,
        organizationId: true,
        brandIdentity: true,
      },
    });
    if (!brand?.organizationId)
      return NextResponse.json(
        { error: "Fixture brand unavailable" },
        { status: 404 },
      );
    const context = await loadCompositionSource({
      brand: { ...brand, organizationId: brand.organizationId },
      sourceUrl,
      templateId: parsed.data.templateId,
    });
    const rendered = renderComposition(parsed.data, context);
    const image = await sharp(Buffer.from(await rendered.arrayBuffer()))
      .resize({ width: 640 })
      .webp({ quality: 85 })
      .toBuffer();
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Copy lab composition failed", error);
    return NextResponse.json(
      { error: "Could not render this composition" },
      { status: 500 },
    );
  }
}
