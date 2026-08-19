import { NextResponse, type NextRequest } from "next/server";

import { compositionSpecSchema } from "@/lib/compositions";
import { getSession } from "@/server/better-auth/server";
import {
  CompositionAccessError,
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
  const parsed = compositionSpecSchema.safeParse({
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
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid composition" },
      { status: 400 },
    );
  }

  try {
    const context = await resolveCompositionContext(
      session.user.id,
      parsed.data,
    );
    return renderComposition(parsed.data, context);
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
