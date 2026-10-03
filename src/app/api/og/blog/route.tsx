import type { NextRequest } from "next/server";
import { ImageResponse } from "next/og";

import { ogSize, readOgOptions } from "@/lib/og-studio";
import { StudioCard } from "../studio-card";

export const runtime = "edge";

export function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    if (!params.get("title")) params.set("title", "Blog");
    params.set("eyebrow", "Blog");
    const options = readOgOptions(params);
    return new ImageResponse(
      <StudioCard options={options} />,
      ogSize(options.format),
    );
  } catch (error) {
    console.error("Blog OG image generation error:", error);
    return new Response("Failed to generate image", { status: 500 });
  }
}
