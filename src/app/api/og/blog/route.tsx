import type { NextRequest } from "next/server";
import { ImageResponse } from "next/og";

import { OG_SIZE, OgCard } from "../og-card";

export const runtime = "edge";

/** Branded OG card for blog posts. Params: `title`, `description`. */
export function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const title = searchParams.get("title") || "Blog";
    const description =
      searchParams.get("description") ||
      "Insights from the Wander growth team.";

    return new ImageResponse(
      <OgCard
        eyebrow="Blog"
        title={title}
        description={description}
        footer="Wander growth team"
      />,
      OG_SIZE,
    );
  } catch (error) {
    console.error("Blog OG image generation error:", error);
    return new Response("Failed to generate image", { status: 500 });
  }
}
