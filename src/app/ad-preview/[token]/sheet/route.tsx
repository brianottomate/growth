import { ImageResponse } from "next/og";
import sharp, { type OverlayOptions } from "sharp";
import type { CSSProperties, ReactNode } from "react";
import { previewImage } from "@/server/services/ad-preview-image";

import type { AdPreviewAd } from "@/lib/ad-preview";
import { loadGoogleFont } from "@/server/services/composition-fonts";
import { loadAdPreviewPage } from "@/server/services/ad-preview.service";

export const runtime = "nodejs";
export const maxDuration = 120;

const WIDTH = 1600;
const PAD = 64;
const ROW = 620;
const TILE = 232;

type Creative = Extract<AdPreviewAd, { kind: "creative" }>;

function clip(text: string | null | undefined, max: number) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** What the image side of a row has to fit in: the sheet less the copy column. */
const IMAGES_WIDTH = WIDTH - PAD * 2 - 64 - 420 - 40;
const GAP = 20;

/**
 * The images a row shows, sized to fit beside the copy: the feed cards (up to
 * three of a carousel), then the 9:16.
 */
function rowImages(ad: Creative) {
  const feed =
    ad.placements.find((p) => p.id === "instagram-feed") ??
    ad.placements.find((p) => p.kind === "feed");
  const story = ad.placements.find((p) => p.kind !== "feed");
  const feedRatio = feed?.crop === "square" ? 1 : 4 / 5;
  const cards = (feed?.media ?? []).slice(0, 3);
  const storyMedia = story?.media[0];
  // Every image shares one height; solve for the tallest that fits the width.
  const units = cards.length * feedRatio + (storyMedia ? 9 / 16 : 0);
  const gaps = (cards.length + (storyMedia ? 1 : 0) - 1) * GAP;
  const height = Math.min(440, Math.floor((IMAGES_WIDTH - gaps) / units));
  return {
    cards: cards.map((item) => ({
      url: item.thumbnail ?? item.url,
      width: Math.round(height * feedRatio),
      height,
    })),
    more: Math.max(0, (feed?.media.length ?? 0) - cards.length),
    story: storyMedia
      ? {
          url: storyMedia.thumbnail ?? storyMedia.url,
          width: Math.round((height * 9) / 16),
          height,
        }
      : null,
  };
}

function Label({ children }: { children: string }) {
  return (
    <div
      style={{
        fontSize: 18,
        color: "#6b6b6b",
        letterSpacing: 0.4,
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

function AdRow({
  ad,
  index,
  images,
}: {
  ad: AdPreviewAd;
  index: number;
  images: Map<string, string>;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 40,
        height: ROW,
        flexShrink: 0,
        padding: 32,
        borderRadius: 24,
        border: "1px solid #e6e6e6",
        background: "#ffffff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 420,
          flexShrink: 0,
          gap: 12,
        }}
      >
        <Label>{`AD ${index + 1} · ${ad.format.toUpperCase()}`}</Label>
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            lineHeight: 1.2,
            lineClamp: 3,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {ad.title ?? `Ad ${index + 1}`}
        </div>
        {ad.kind === "creative" ? (
          // satori lays a fragment's children out as a row; keep a real column.
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              flexGrow: 1,
              minHeight: 0,
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                lineHeight: 1.25,
                lineClamp: 2,
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {clip(ad.headline, 80)}
            </div>
            <div
              style={{
                fontSize: 19,
                color: "#3d3d3d",
                lineHeight: 1.4,
                whiteSpace: "pre-wrap",
                lineClamp: 6,
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {clip(ad.body, 260)}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: "auto",
                alignSelf: "flex-start",
                padding: "10px 20px",
                borderRadius: 999,
                background: "#1f1f1f",
                color: "#ffffff",
                fontSize: 18,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {ad.callToAction
                .toLowerCase()
                .replace(/_/g, " ")
                .replace(/^\w/, (c) => c.toUpperCase())}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {ad.headlines.slice(0, 6).map((line) => (
              <div key={line} style={{ fontSize: 20, color: "#1a0dab" }}>
                {clip(line, 60)}
              </div>
            ))}
            {ad.descriptions.slice(0, 3).map((line) => (
              <div key={line} style={{ fontSize: 18, color: "#4d5156" }}>
                {clip(line, 120)}
              </div>
            ))}
          </div>
        )}
      </div>
      {ad.kind === "creative" && <AdImages ad={ad} images={images} />}
    </div>
  );
}

function AdImages({
  ad,
  images,
}: {
  ad: Creative;
  images: Map<string, string>;
}) {
  const { cards, more, story } = rowImages(ad);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", gap: GAP, alignItems: "flex-end" }}>
        {cards.map((card, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={images.get(card.url)}
            width={card.width}
            height={card.height}
            style={{ objectFit: "cover", borderRadius: 16 }}
          />
        ))}
        {story && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={images.get(story.url)}
            width={story.width}
            height={story.height}
            style={{ objectFit: "cover", borderRadius: 16 }}
          />
        )}
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 16, color: "#8a8a8a" }}>
        {`Feed${cards.length > 1 ? ` · ${cards.length + more} cards` : ""}${more ? ` (first ${cards.length} shown)` : ""}${story ? " · then Stories (9:16)" : ""}`}
      </div>
    </div>
  );
}

/**
 * The preview as one composed sheet, drawn on the server with satori: the
 * campaign's ads as rows (copy beside the saved feed and 9:16 images) and
 * the catalog export as a grid. Not a screenshot of the page: a fixed
 * layout that renders the same anywhere, with no browser involved.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const preview = await loadAdPreviewPage(token);
  if (!preview) return new Response(null, { status: 404 });
  const ads = preview.campaign?.ads ?? [];
  const cards = preview.catalog?.cards ?? [];
  // Deduplicate and resize before Satori embeds images. Original campaign
  // artwork can otherwise consume gigabytes on an all-ads export.
  const sources = [
    ...new Set([
      ...ads.flatMap((ad) => {
        if (ad.kind !== "creative") return [];
        const { cards, story } = rowImages(ad);
        return [
          ...cards.map((card) => card.url),
          ...(story ? [story.url] : []),
        ];
      }),
      ...cards.map((card) => card.image),
    ]),
  ];
  const images = new Map<string, string>();
  let next = 0;
  try {
    await Promise.all(
      Array.from({ length: Math.min(3, sources.length) }, async () => {
        while (next < sources.length) {
          const src = sources[next++]!;
          const { body, type } = await previewImage(src);
          images.set(src, `data:${type};base64,${body.toString("base64")}`);
        }
      }),
    );
  } catch {
    return new Response("Artwork could not be loaded. Please try again.", {
      status: 502,
    });
  }
  const perRow = Math.floor((WIDTH - PAD * 2 + 24) / (TILE + 24));
  const catalogHeight = cards.length
    ? 220 + Math.ceil(cards.length / perRow) * (TILE + 130)
    : 0;
  const height = PAD * 2 + 140 + ads.length * (ROW + 32) + catalogHeight + 60;
  const fonts = await loadGoogleFont("Instrument Sans", [400, 600]);

  const sheet = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: WIDTH,
        height,
        padding: PAD,
        gap: 32,
        background: "#f6f5f3",
        color: "#1f1f1f",
        fontFamily: fonts ? "Instrument Sans" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", gap: 24 }}>
        <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: -1 }}>
          Wander
        </div>
        <div style={{ fontSize: 26, color: "#6b6b6b", paddingBottom: 6 }}>
          {`Ads for ${preview.brandName}`}
        </div>
      </div>
      {ads.length > 0 && (
        <Label>{`CAMPAIGN · ${ads.length} ${ads.length === 1 ? "AD" : "ADS"}${preview.campaign?.unavailableAds ? ` · ${preview.campaign.unavailableAds} APPROVED ADS AWAITING PREVIEW ARTWORK` : ""}`}</Label>
      )}
      {ads.map((ad, index) => (
        <AdRow key={ad.id} ad={ad} index={index} images={images} />
      ))}
      {cards.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Label>{`CATALOG · ${cards.length} OF ${preview.catalog?.totalCards} HOMES`}</Label>
          <div
            style={{ fontSize: 19, color: "#3d3d3d", whiteSpace: "pre-wrap" }}
          >
            {clip(preview.catalog?.ad?.primaryText, 400)}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
            {cards.map((card) => (
              <div
                key={card.key}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: TILE,
                  gap: 8,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={images.get(card.image)}
                  width={TILE}
                  height={TILE}
                  style={{ objectFit: "contain", borderRadius: 14 }}
                />
                <div style={{ fontSize: 17, fontWeight: 600 }}>
                  {clip(card.headline, 60)}
                </div>
                <div style={{ fontSize: 16, color: "#6b6b6b" }}>
                  {clip(card.description, 100)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div
        style={{
          display: "flex",
          marginTop: "auto",
          fontSize: 16,
          color: "#8a8a8a",
        }}
      >
        Prepared by Wander Performance · Composed overview; long copy and
        carousels are shortened.
      </div>
    </div>
  );

  const download = new URL(request.url).searchParams.get("download") === "1";
  // Render bounded panels sequentially: a single tall Satori canvas grows
  // WASM memory with every ad. Sharp assembles the finished panels natively.
  const { children, style } = sheet.props as {
    children: ReactNode[];
    style: CSSProperties;
  };
  const panels = [
    { content: [children[0], children[1]], height: 140 },
    ...ads.map((ad, index) => ({
      content: <AdRow ad={ad} index={index} images={images} />,
      height: ROW + 32,
    })),
    { content: [children[3], children[4]], height: catalogHeight + 60 },
  ];
  const composites: OverlayOptions[] = [];
  let top = PAD;
  for (const panel of panels) {
    const response = new ImageResponse(
      <div
        style={{
          ...style,
          height: panel.height,
          padding: `0 ${PAD}px`,
          gap: 20,
        }}
      >
        {panel.content}
      </div>,
      {
        width: WIDTH,
        height: panel.height,
        emoji: "twemoji",
        ...(fonts ? { fonts } : {}),
      },
    );
    composites.push({
      input: Buffer.from(await response.arrayBuffer()),
      top,
      left: 0,
    });
    top += panel.height;
  }
  const body = await sharp({
    create: { width: WIDTH, height, channels: 3, background: "#f6f5f3" },
  })
    .composite(composites)
    .png()
    .toBuffer();
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
      ...(download
        ? {
            "Content-Disposition": `attachment; filename="${preview.brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-ads-sheet.png"`,
          }
        : {}),
    },
  });
}
