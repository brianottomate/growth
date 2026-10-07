import { ImageResponse } from "next/og";

import type { AdPreviewAd } from "@/lib/ad-preview";
import { loadGoogleFont } from "@/server/services/composition-fonts";
import { loadAdPreviewPage } from "@/server/services/ad-preview.service";

export const runtime = "nodejs";

const WIDTH = 1600;
const PAD = 64;
const ROW = 520;
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
    <div style={{ fontSize: 18, color: "#6b6b6b", letterSpacing: 0.4 }}>
      {children}
    </div>
  );
}

function AdRow({ ad, index }: { ad: AdPreviewAd; index: number }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 40,
        height: ROW,
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
          gap: 12,
        }}
      >
        <Label>{`AD ${index + 1} · ${ad.format.toUpperCase()}`}</Label>
        <div style={{ fontSize: 32, fontWeight: 600 }}>
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
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 8 }}>
              {clip(ad.headline, 80)}
            </div>
            <div
              style={{
                fontSize: 19,
                color: "#3d3d3d",
                lineHeight: 1.4,
                whiteSpace: "pre-wrap",
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
      {ad.kind === "creative" && <AdImages ad={ad} />}
    </div>
  );
}

function AdImages({ ad }: { ad: Creative }) {
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
            src={card.url}
            width={card.width}
            height={card.height}
            style={{ objectFit: "cover", borderRadius: 16 }}
          />
        ))}
        {story && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={story.url}
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
  const perRow = Math.floor((WIDTH - PAD * 2 + 24) / (TILE + 24));
  const catalogHeight = cards.length
    ? 120 + Math.ceil(cards.length / perRow) * (TILE + 72)
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
        <Label>{`CAMPAIGN · ${ads.length} ${ads.length === 1 ? "AD" : "ADS"}`}</Label>
      )}
      {ads.map((ad, index) => (
        <AdRow key={ad.id} ad={ad} index={index} />
      ))}
      {cards.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Label>{`CATALOG · ${cards.length} HOMES`}</Label>
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
                  src={card.image}
                  width={TILE}
                  height={TILE}
                  style={{ objectFit: "cover", borderRadius: 14 }}
                />
                <div style={{ fontSize: 17, fontWeight: 600 }}>
                  {clip(card.headline, 28)}
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
        Prepared by Wander Performance
      </div>
    </div>
  );

  const download = new URL(request.url).searchParams.get("download") === "1";
  return new ImageResponse(sheet, {
    width: WIDTH,
    height,
    emoji: "twemoji",
    ...(fonts ? { fonts } : {}),
    headers: {
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
