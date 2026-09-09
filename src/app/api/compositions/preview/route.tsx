import { NextResponse, type NextRequest } from "next/server";

import { compositionPreviewSchema } from "@/lib/compositions";
import { getSession } from "@/server/better-auth/server";
import {
  CompositionAccessError,
  loadCompositionSource,
  renderComposition,
  resolveCompositionContext,
} from "@/server/services/composition.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  // A photo by URL instead of a library asset: the on-demand previews on the
  // brand page draw straight from a client's listing feed. The service checks
  // the host; here it only has to be present when no asset is.
  const sourceUrl = params.get("sourceUrl") || null;
  const parsed = compositionPreviewSchema.safeParse({
    brandId: params.get("brandId"),
    templateId: params.get("templateId"),
    formatId: params.get("formatId"),
    sourceMediaAssetId: params.get("sourceMediaAssetId") || undefined,
    title: params.get("title"),
    subtitle: params.get("subtitle") || undefined,
    eyebrow: params.get("eyebrow") || undefined,
    cta: params.get("cta") || undefined,
    accent: params.get("accent") || undefined,
    imagePosition: params.get("imagePosition") || "center",
    focal:
      params.get("focalX") && params.get("focalY")
        ? { x: Number(params.get("focalX")), y: Number(params.get("focalY")) }
        : undefined,
    scrim: params.get("scrim") || undefined,
    rating: params.get("rating") ? Number(params.get("rating")) : undefined,
    mark: params.get("mark") || "auto",
  });
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
    return renderComposition(parsed.data, await loadCompositionSource(context));
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
