import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";

import { compositionPreviewFromParams } from "@/lib/compositions";
import { getSession } from "@/server/better-auth/server";
import {
  CompositionAccessError,
  loadCompositionSource,
  renderComposition,
  resolveCompositionContext,
} from "@/server/services/composition.service";
import { googleFontCatalog } from "@/server/services/brand-fonts.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const { sourceUrl, parsed } = compositionPreviewFromParams(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid composition" },
      { status: 400 },
    );
  }
  if (
    parsed.data.templateId !== "brand-statement" &&
    !parsed.data.sourceMediaAssetId &&
    !sourceUrl
  ) {
    return NextResponse.json(
      { error: "This blueprint needs a source image" },
      { status: 400 },
    );
  }

  try {
    const context = await resolveCompositionContext(
      session.user.id,
      parsed.data,
      { sourceUrl },
    );
    // A draft font from the setup page's preview strip. Only Google families
    // reach the font loader; anything else renders in the brand's own font.
    const fontParam = params.get("fontFamily")?.trim().slice(0, 80) || null;
    const fontFamily =
      fontParam &&
      (await googleFontCatalog()).some((font) => font.family === fontParam)
        ? fontParam
        : null;
    const image = renderComposition(
      parsed.data,
      await loadCompositionSource(context, { fontFamily }),
    );
    // The URL is the whole recipe, so a reload reuses the render. Brand-level
    // changes (mark, fonts) show within the hour.
    const headers = { "Cache-Control": "private, max-age=3600" };
    const width = Number(params.get("w"));
    if (!width) {
      return new Response(image.body, {
        headers: { ...headers, "Content-Type": "image/png" },
      });
    }
    // A thumbnail: the full PNG of a photo runs to megabytes.
    const webp = await sharp(Buffer.from(await image.arrayBuffer()))
      .resize({ width: Math.min(Math.max(width, 64), 1080) })
      .webp({ quality: 80 })
      .toBuffer();
    return new Response(new Uint8Array(webp), {
      headers: { ...headers, "Content-Type": "image/webp" },
    });
  } catch (error) {
    if (error instanceof CompositionAccessError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Composition preview failed", error);
    return NextResponse.json(
      { error: "Could not render composition" },
      { status: 500 },
    );
  }
}
