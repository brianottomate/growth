import type { NextRequest } from "next/server";
import { ImageResponse } from "next/og";

import {
  PLACEHOLDER_FORMATS,
  readPlaceholderParams,
} from "@/lib/placeholder-image";

export const runtime = "nodejs";

// The URL fully determines the image, so it can be cached forever.
export async function GET(request: NextRequest) {
  const spec = readPlaceholderParams(new URL(request.url).searchParams);
  const { width, height, label } = PLACEHOLDER_FORMATS[spec.format];
  const scale = width / 1080;
  const px = (n: number) => `${Math.round(n * scale)}px`;
  // Landscape is short: smaller type and fewer lines so the longest allowed
  // title and description still fit inside the card.
  const wide = spec.format === "landscape";

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        padding: px(40),
        background: "#EFEEEA",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: px(64),
          border: `${px(4)} dashed #B9B6AE`,
          borderRadius: px(28),
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: px(26),
            letterSpacing: px(4),
            color: "#6F6C64",
          }}
        >
          <span>PLACEHOLDER</span>
          <span>
            {label} · {width}×{height}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "block",
              lineClamp: wide ? 2 : 4,
              fontSize: px(wide ? 46 : 78),
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: px(-2),
              color: "#1A1917",
            }}
          >
            {spec.title}
          </div>
          {spec.description ? (
            <div
              style={{
                display: "block",
                lineClamp: wide ? 3 : 6,
                marginTop: px(wide ? 20 : 32),
                fontSize: px(wide ? 26 : 34),
                lineHeight: 1.35,
                color: "#55524B",
              }}
            >
              {spec.description}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    {
      width,
      height,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
  );
}
