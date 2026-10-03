import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { ImageResponse } from "next/og";

import { ogSize, readOgOptions } from "@/lib/og-studio";
import { OgCard } from "./og-card";
import { StudioCard } from "./studio-card";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const options = readOgOptions(params);
    let photo: string | undefined;
    if (
      options.image === "wander-home" &&
      ["split", "editorial"].includes(options.layout)
    ) {
      const bytes = await readFile(
        path.join(process.cwd(), "public/auth-hero.jpg"),
      );
      photo = `data:image/jpeg;base64,${bytes.toString("base64")}`;
    }
    const card =
      options.layout === "brand" && options.format === "landscape" ? (
        <OgCard
          title={options.title}
          eyebrow={options.eyebrow}
          description={options.description}
          footer={options.footer}
        />
      ) : (
        <StudioCard options={options} photo={photo} />
      );
    return new ImageResponse(card, {
      ...ogSize(options.format),
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        ...(params.get("download") === "1"
          ? {
              "Content-Disposition": `attachment; filename="wander-growth-${options.format}.png"`,
            }
          : {}),
      },
    });
  } catch (error) {
    console.error("OG image generation error:", error);
    return new Response("Failed to generate image", { status: 500 });
  }
}
