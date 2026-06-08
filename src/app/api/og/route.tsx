import type { NextRequest } from "next/server";
import { ImageResponse } from "next/og";

import { OG_SIZE, OgCard } from "./og-card";

export const runtime = "edge";

/** Branded OG card. Params: `title`, `eyebrow` (kicker), `description`. */
export function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const title = searchParams.get("title") || "Wander Growth";
    const eyebrow = searchParams.get("eyebrow") || undefined;
    const description = searchParams.get("description") || undefined;

    return new ImageResponse(
      <OgCard title={title} eyebrow={eyebrow} description={description} />,
      OG_SIZE,
    );
  } catch (error) {
    console.error("OG image generation error:", error);
    return new Response("Failed to generate image", { status: 500 });
  }
}
