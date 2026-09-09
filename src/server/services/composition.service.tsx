import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { ImageResponse } from "next/og";

import {
  type CompositionSpec,
  type FreezeCompositionInput,
  compositionSpecSchema,
  getCompositionFormat,
  getCompositionIdentity,
} from "@/lib/compositions";
import { R2 } from "@/server/clients/r2.client";
import { db } from "@/server/db";
import { brandTable, mediaAssetTable, memberTable } from "@/server/db/schema";
import {
  brandFontFamily,
  loadGoogleFont,
  type LoadedFont,
} from "@/server/services/composition-fonts";
import {
  fetchSatoriImageSource,
  loadLogoImage,
  type LogoImage,
} from "@/server/services/composition-source";
import type { BrandMark } from "@/server/db/schema";
import { importImageBuffer } from "@/server/services/media.service";

export type CompositionContext = {
  brand: {
    id: string;
    name: string;
    logo: string | null;
    brandMark: BrandMark | null;
    organizationId: string;
    brandIdentity: {
      colorScheme?: "light" | "dark";
      colors?: { primary?: string; secondary?: string; accent?: string };
    } | null;
  };
  /** Where the source lives. A lookup needs only this; a render loads it. */
  sourceUrl: string | null;
};

/** A context with everything satori draws loaded: source, logo, brand font. */
export type RenderContext = CompositionContext & {
  sourceImage: string | null;
  logo: LogoImage | null;
  fonts: LoadedFont[] | null;
};

export class CompositionAccessError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 404 | 422,
  ) {
    super(message);
  }
}

function safeHex(value: string | undefined, fallback: string) {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function safeFilename(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "composition"
  );
}

/**
 * The darkening colour as a function of alpha. Whatever hex arrives is pulled
 * down until its brightest channel is 40/255, so a tint reads as a deep
 * version of the photo's hue and white type stays as legible as over black.
 */
export function scrimRgba(hex: string | undefined) {
  const safe = safeHex(hex, "#000000");
  const channels = [1, 3, 5].map((at) => parseInt(safe.slice(at, at + 2), 16));
  const brightest = Math.max(...channels);
  const scale = brightest > 40 ? 40 / brightest : 1;
  const [r, g, b] = channels.map((value) => Math.round(value * scale));
  return (alpha: number) => `rgba(${r},${g},${b},${alpha})`;
}

function clamp(value: string | undefined, max: number) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;
}

function wrapText(value: string, maxCharacters: number) {
  return value.split(/\s+/).reduce<string[]>((lines, word) => {
    const current = lines.at(-1);
    if (!current || current.length + word.length + 1 > maxCharacters) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${current} ${word}`;
    }
    return lines;
  }, []);
}

export async function resolveCompositionContext(
  userId: string,
  spec: CompositionSpec,
): Promise<CompositionContext> {
  const brand = await db.query.brandTable.findFirst({
    where: and(eq(brandTable.id, spec.brandId), isNull(brandTable.deletedAt)),
    columns: {
      id: true,
      name: true,
      logo: true,
      brandMark: true,
      organizationId: true,
      brandIdentity: true,
    },
  });
  if (!brand?.organizationId) {
    throw new CompositionAccessError("Brand not found", 404);
  }

  const membership = await db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.userId, userId),
      eq(memberTable.organizationId, brand.organizationId),
    ),
    columns: { id: true },
  });
  if (!membership) {
    throw new CompositionAccessError("No access to this brand", 403);
  }

  let sourceUrl: string | null = null;
  if (spec.sourceMediaAssetId) {
    const source = await db.query.mediaAssetTable.findFirst({
      where: and(
        eq(mediaAssetTable.id, spec.sourceMediaAssetId),
        eq(mediaAssetTable.brandId, brand.id),
        eq(mediaAssetTable.provider, "r2"),
        eq(mediaAssetTable.kind, "image"),
        eq(mediaAssetTable.status, "ready"),
        isNull(mediaAssetTable.deletedAt),
      ),
      columns: { url: true },
    });
    if (!source?.url || !R2.isPublicUrl(source.url)) {
      throw new CompositionAccessError(
        "Choose a ready image from this brand's library",
        422,
      );
    }
    sourceUrl = source.url;
  }

  if (spec.templateId !== "brand-statement" && !sourceUrl) {
    throw new CompositionAccessError(
      "This blueprint needs a source image",
      422,
    );
  }

  return {
    brand: {
      ...brand,
      organizationId: brand.organizationId,
      brandIdentity: brand.brandIdentity ?? null,
      brandMark: brand.brandMark ?? null,
    },
    sourceUrl,
  };
}

/**
 * The chosen mark's three variants as one logo: colour as `src`, white as
 * `inverse`, near-black as `dark`. Rendered once when the mark was set, so
 * this is three small downloads and no image work.
 */
async function loadChosenMark(mark: BrandMark): Promise<LogoImage | null> {
  const rows = await db.query.mediaAssetTable.findMany({
    where: and(
      inArray(mediaAssetTable.id, [
        mark.variants.color,
        mark.variants.white,
        mark.variants.dark,
      ]),
      isNull(mediaAssetTable.deletedAt),
    ),
    columns: { id: true, url: true },
  });
  const url = (id: string) => rows.find((row) => row.id === id)?.url ?? null;
  const colorUrl = url(mark.variants.color);
  if (!colorUrl) return null;
  const [color, white, dark] = await Promise.all([
    loadLogoImage(colorUrl),
    url(mark.variants.white) ? loadLogoImage(url(mark.variants.white)!) : null,
    url(mark.variants.dark) ? loadLogoImage(url(mark.variants.dark)!) : null,
  ]);
  // A traced vector beats the bitmap: satori draws it sharp at any size.
  const svg = (markup: string) =>
    `data:image/svg+xml;base64,${Buffer.from(markup).toString("base64")}`;
  return {
    ...color,
    src: mark.vector?.color ? svg(mark.vector.color) : color.src,
    inverse: mark.vector ? svg(mark.vector.white) : (white?.src ?? color.inverse),
    dark: mark.vector ? svg(mark.vector.dark) : (dark?.src ?? color.dark),
    small: false,
  };
}

/**
 * Download and transcode the source for a render. Kept apart from
 * `resolveCompositionContext` so `findFrozenComposition` can match a cached
 * card without paying for bytes it will never draw.
 */
export async function loadCompositionSource(
  context: CompositionContext,
): Promise<RenderContext> {
  const family = brandFontFamily(context.brand.brandIdentity);
  // The logo and the font are best effort: a card without them is still the
  // card. The source is not; its failure is the render's failure.
  const [sourceImage, logo, fonts] = await Promise.all([
    context.sourceUrl ? fetchSatoriImageSource(context.sourceUrl) : null,
    (context.brand.brandMark
      ? loadChosenMark(context.brand.brandMark)
      : context.brand.logo
        ? loadLogoImage(context.brand.logo)
        : Promise.resolve(null)
    ).catch((error: unknown) => {
      console.error("brand mark unavailable", context.brand.id, error);
      return null;
    }),
    family ? loadGoogleFont(family) : null,
  ]);
  return { ...context, sourceImage, logo, fonts };
}

// Drawn, not typed: the house font has no ★ and satori's fallback fetch for
// missing glyphs is not something a render should depend on.
function Stars({ count, size }: { count: number; size: number }) {
  return (
    <div style={{ display: "flex", gap: Math.round(size * 0.18) }}>
      {Array.from({ length: count }, (_, index) => (
        <svg
          key={index}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="#ffffff"
        >
          <path d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.7L12 17.6l-6 3.3 1.3-6.7-5-4.7 6.8-.8z" />
        </svg>
      ))}
    </div>
  );
}

function BrandMark({
  brandName,
  logo,
  tone = "auto",
  inverse = false,
  markSize = 36,
  textSize = 24,
}: {
  brandName: string;
  logo?: LogoImage | null;
  tone?: CompositionSpec["mark"];
  inverse?: boolean;
  markSize?: number;
  textSize?: number;
}) {
  if (tone === "none") return null;
  if (logo) {
    // A real logo stands alone, whatever its shape: a stacked mark already
    // carries the name. Only a favicon-sized icon gets the name beside it.
    const alone = !logo.small;
    const wide = logo.width / logo.height > 2;
    const height = alone
      ? Math.round(markSize * (wide ? 1.2 : 2.4))
      : markSize;
    const width = Math.round((height * logo.width) / logo.height);
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          color: inverse ? "#ffffff" : "#111111",
          fontSize: textSize,
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={
            tone === "white" || (tone === "auto" && inverse)
              ? (logo.inverse ?? logo.src)
              : tone === "dark"
                ? (logo.dark ?? logo.src)
                : logo.src
          }
          alt=""
          width={width}
          height={height}
          style={{ width, height, objectFit: "contain" }}
        />
        {alone ? null : clamp(brandName, 32)}
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        color: inverse ? "#ffffff" : "#111111",
        fontSize: textSize,
        fontWeight: 700,
        letterSpacing: "-0.02em",
      }}
    >
      <div
        style={{
          display: "flex",
          width: markSize,
          height: markSize,
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: Math.round(markSize * 0.34),
          background: inverse ? "rgba(255,255,255,0.2)" : "#111111",
          color: "#ffffff",
          fontSize: Math.round(markSize * 0.48),
        }}
      >
        {brandName.slice(0, 1).toUpperCase()}
      </div>
      {clamp(brandName, 32)}
    </div>
  );
}

function Message({
  spec,
  color,
  titleSize,
}: {
  spec: CompositionSpec;
  color: string;
  titleSize: number;
}) {
  const titleLines = wrapText(
    clamp(spec.title, 120),
    spec.formatId === "story"
      ? 22
      : spec.formatId === "portrait" || spec.formatId === "square"
        ? 26
        : 42,
  );
  const subtitleLines = wrapText(
    clamp(spec.subtitle, 220),
    spec.formatId === "story"
      ? 44
      : spec.formatId === "portrait" || spec.formatId === "square"
        ? 52
        : 76,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", color }}>
      {spec.eyebrow ? (
        <div
          style={{
            display: "flex",
            marginBottom: 20,
            fontSize: Math.max(18, titleSize * 0.3),
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          {clamp(spec.eyebrow, 40)}
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          maxWidth: "100%",
          fontSize: titleSize,
          fontWeight: 760,
          lineHeight: 0.98,
          letterSpacing: "-0.045em",
        }}
      >
        {titleLines.map((line) => (
          <div key={line} style={{ display: "flex" }}>
            {line}
          </div>
        ))}
      </div>
      {spec.subtitle ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            marginTop: 24,
            maxWidth: "92%",
            fontSize: Math.max(21, titleSize * 0.36),
            lineHeight: 1.28,
            opacity: 0.78,
          }}
        >
          {subtitleLines.map((line) => (
            <div key={line} style={{ display: "flex" }}>
              {line}
            </div>
          ))}
        </div>
      ) : null}
      {spec.cta ? (
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            marginTop: 30,
            padding: "13px 20px",
            borderRadius: 999,
            background: color,
            color: color === "#ffffff" ? "#111111" : "#ffffff",
            fontSize: Math.max(18, titleSize * 0.28),
            fontWeight: 700,
          }}
        >
          {clamp(spec.cta, 60)}
        </div>
      ) : null}
    </div>
  );
}

function resolveAccent(spec: CompositionSpec, context: CompositionContext) {
  return safeHex(
    spec.accent ??
      context.brand.brandIdentity?.colors?.accent ??
      context.brand.brandIdentity?.colors?.primary,
    "#18a8b5",
  );
}

/**
 * Everything a render reads: the spec's identity plus the brand inputs the
 * templates draw, the name in the mark and the resolved accent. Stored on the
 * asset and matched on reuse, so a rename or a palette change renders again.
 */
function renderInputs(
  spec: FreezeCompositionInput,
  context: CompositionContext,
) {
  return {
    ...getCompositionIdentity(spec),
    brandName: context.brand.name,
    brandLogo: context.brand.brandMark?.variants.color ?? context.brand.logo ?? null,
    fontFamily: brandFontFamily(context.brand.brandIdentity),
    renderedAccent: resolveAccent(spec, context),
  };
}

/**
 * The lines a catalog card breaks its headline into. Exported so the art
 * director can be told where the breaks fall instead of having to see them.
 */
export function catalogHeadline(
  spec: Pick<CompositionSpec, "title" | "formatId"> &
    Partial<Pick<CompositionSpec, "templateId" | "eyebrow">>,
) {
  if (spec.templateId === "catalog-place") return placeStatement(spec);
  return wrapText(clamp(spec.title, 90), spec.formatId === "square" ? 24 : 22);
}

/** Where a hook hands over to the place: the word that goes down with the place. */
const HOOK_PREPOSITIONS = new Set([
  "in", "at", "on", "near", "by", "above", "below", "beside", "overlooking",
  "outside", "inside", "from", "of", "for", "to", "off", "along", "across",
]);

/**
 * The place card's one headline: the hook and the place read as a single
 * statement, set on two lines that break where the sense does ("A 4-bedroom
 * villa sleeping 8" / "in Winter Park, CO"), never mid-phrase by character
 * count. A hook too long for one line wraps first and the place still takes
 * its own line. Exported so the art director is told the same breaks.
 */
export function placeStatement(
  spec: Pick<CompositionSpec, "title" | "formatId"> & Partial<Pick<CompositionSpec, "eyebrow">>,
) {
  const perLine = spec.formatId === "square" ? 24 : 28;
  const place = clamp(spec.title.trim(), 40);
  const hook = clamp(spec.eyebrow?.trim() ?? "", 60);
  if (!hook) return wrapText(place, perLine);
  const words = hook.split(/\s+/);
  const last = words.at(-1)?.toLowerCase() ?? "";
  const handover = HOOK_PREPOSITIONS.has(last) ? words.pop()! : null;
  const placeLine = handover ? `${handover} ${place}` : place;
  return [...wrapText(words.join(" "), perLine), ...wrapText(placeLine, perLine)].slice(0, 3);
}

export function renderComposition(
  spec: CompositionSpec,
  context: RenderContext,
) {
  const format = getCompositionFormat(spec.formatId);
  const accent = resolveAccent(spec, context);
  const portrait = format.height > format.width;
  const square = format.height === format.width;
  const padding = portrait ? 68 : 58;
  const titleSize = portrait ? 78 : 68;
  // A focal point pans the cover crop so that point of the photo lands at the
  // same fraction of the canvas, which keeps it in frame whatever the ratio.
  const imagePosition = spec.focal
    ? `${spec.focal.x}% ${spec.focal.y}%`
    : spec.imagePosition === "top"
      ? "center top"
      : spec.imagePosition === "bottom"
        ? "center bottom"
        : "center center";
  const scrim = scrimRgba(spec.scrim);

  let content: React.ReactNode;
  if (spec.templateId === "image-hero") {
    content = (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          background: "#111111",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={context.sourceImage!}
          alt=""
          width={format.width}
          height={format.height}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: imagePosition,
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.54) 48%, rgba(0,0,0,0.08) 100%)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            position: "absolute",
            inset: 0,
            padding,
          }}
        >
          <BrandMark brandName={context.brand.name} logo={context.logo} tone={spec.mark} inverse />
          <div style={{ display: "flex", maxWidth: portrait ? "92%" : "64%" }}>
            <Message spec={spec} color="#ffffff" titleSize={titleSize} />
          </div>
        </div>
      </div>
    );
  } else if (spec.templateId === "split-frame") {
    content = (
      <div
        style={{
          display: "flex",
          flexDirection: portrait ? "column" : "row",
          width: "100%",
          height: "100%",
          padding,
          gap: 46,
          background: "#f5f4f0",
          color: "#111111",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: portrait ? "100%" : "44%",
            height: portrait ? "43%" : "100%",
          }}
        >
          <BrandMark brandName={context.brand.name} logo={context.logo} tone={spec.mark} />
          <Message spec={spec} color="#111111" titleSize={portrait ? 72 : 62} />
        </div>
        <div
          style={{
            display: "flex",
            flex: 1,
            padding: 14,
            borderRadius: 34,
            background: "#181818",
            boxShadow: "0 24px 60px rgba(0,0,0,0.24)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={context.sourceImage!}
            alt=""
            width={format.width}
            height={format.height}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: imagePosition,
              borderRadius: 22,
            }}
          />
        </div>
      </div>
    );
  } else if (spec.templateId === "editorial-overlay") {
    content = (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          background: "#111111",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={context.sourceImage!}
          alt=""
          width={format.width}
          height={format.height}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: imagePosition,
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.08) 72%)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            position: "absolute",
            inset: 0,
            padding,
          }}
        >
          <BrandMark brandName={context.brand.name} logo={context.logo} tone={spec.mark} inverse />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                width: 90,
                height: 8,
                marginBottom: 28,
                borderRadius: 8,
                background: accent,
              }}
            />
            <Message
              spec={spec}
              color="#ffffff"
              titleSize={portrait ? 84 : 72}
            />
          </div>
        </div>
      </div>
    );
  } else if (spec.templateId === "product-proof") {
    const landscape = format.width > format.height;
    const proofPadding = square ? 80 : padding;
    const copyWidth = landscape ? "46%" : square ? "48%" : "70%";
    const proofWidth = landscape ? "48%" : square ? "51%" : "72%";
    const proofHeight = landscape ? "82%" : square ? "65%" : "56%";
    const proofRight = landscape ? -24 : square ? -18 : -96;
    const proofBottom = landscape ? -30 : square ? -42 : -82;
    const proofTitleSize = landscape ? 58 : square ? 68 : 78;
    const proofSubtitleSize = landscape ? 25 : square ? 30 : 34;
    content = (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          padding: proofPadding,
          color: "#17171b",
          background: "#f4f1ea",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "relative",
            width: "100%",
            height: "100%",
          }}
        >
          <BrandMark
            brandName={context.brand.name} logo={context.logo} tone={spec.mark}
            markSize={square ? 48 : 42}
            textSize={square ? 30 : 27}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: copyWidth,
              marginTop: square ? 76 : portrait ? 112 : 62,
            }}
          >
            <div
              style={{
                display: "flex",
                width: square ? 82 : 72,
                height: 7,
                marginBottom: square ? 38 : 30,
                borderRadius: 8,
                background: accent,
              }}
            />
            {spec.eyebrow ? (
              <div
                style={{
                  display: "flex",
                  marginBottom: square ? 34 : 26,
                  color: "#66676e",
                  fontSize: square ? 24 : 21,
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  lineHeight: 1.35,
                  textTransform: "uppercase",
                }}
              >
                {clamp(spec.eyebrow, 40)}
              </div>
            ) : null}
            <div
              style={{
                display: "flex",
                color: "#17171b",
                fontSize: proofTitleSize,
                fontWeight: 700,
                letterSpacing: "-0.035em",
                lineHeight: 1.04,
              }}
            >
              {clamp(spec.title, 120)}
            </div>
            {spec.subtitle ? (
              <div
                style={{
                  display: "flex",
                  marginTop: square ? 34 : 26,
                  color: "#55565d",
                  fontSize: proofSubtitleSize,
                  lineHeight: 1.32,
                }}
              >
                {clamp(spec.subtitle, 220)}
              </div>
            ) : null}
            {spec.cta ? (
              <div
                style={{
                  display: "flex",
                  alignSelf: "flex-start",
                  marginTop: square ? 34 : 28,
                  padding: square ? "18px 30px" : "15px 25px",
                  borderRadius: 999,
                  color: "#ffffff",
                  background: "#17171b",
                  fontSize: square ? 25 : 22,
                  fontWeight: 700,
                }}
              >
                {clamp(spec.cta, 60)}
              </div>
            ) : null}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            position: "absolute",
            width: proofWidth,
            height: proofHeight,
            right: proofRight,
            bottom: proofBottom,
            overflow: "hidden",
            borderRadius: square ? "26px 0 0 0" : 28,
            background: "#ffffff",
            boxShadow: "0 28px 70px rgba(24,24,27,0.16)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={context.sourceImage!}
            alt=""
            width={format.width}
            height={format.height}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: imagePosition,
            }}
          />
        </div>
      </div>
    );
  } else if (
    spec.templateId === "catalog-copy" ||
    spec.templateId === "catalog-review"
  ) {
    const review = spec.templateId === "catalog-review";
    const pad = square ? 56 : 64;
    const headline = review
      ? wrapText(`“${clamp(spec.title, 110)}”`, square ? 24 : 22)
      : catalogHeadline(spec);
    const headlineSize = review ? (square ? 56 : 62) : square ? 62 : 70;
    const line = clamp(spec.subtitle, 80);
    const stars = review && spec.rating ? Math.round(spec.rating) : 0;
    content = (
      <div
        style={{
          display: "flex",
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "#000000",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={context.sourceImage!}
          alt=""
          width={format.width}
          height={format.height}
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: imagePosition,
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "62%",
            background: `linear-gradient(180deg, ${scrim(0)} 0%, ${scrim(0.55)} 45%, ${scrim(0.82)} 100%)`,
          }}
        />
        {/* Brand logos arrive in brand colours, not white; a light scrim keeps
            a dark mark readable over a bright sky. */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: "26%",
            background: `linear-gradient(180deg, ${scrim(0.45)} 0%, ${scrim(0)} 100%)`,
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: pad,
            left: pad,
          }}
        >
          <BrandMark brandName={context.brand.name} logo={context.logo} tone={spec.mark} inverse />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            left: pad,
            right: pad,
            bottom: pad,
            color: "#ffffff",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: headlineSize,
              fontWeight: review ? 600 : 700,
              lineHeight: 1.06,
              letterSpacing: "-0.03em",
            }}
          >
            {headline.map((text) => (
              <div key={text} style={{ display: "flex" }}>
                {text}
              </div>
            ))}
          </div>
          {line || stars ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginTop: 18,
                fontSize: square ? 24 : 26,
                opacity: 0.86,
              }}
            >
              {line ? <div style={{ display: "flex" }}>{line}</div> : null}
              {stars ? <Stars count={stars} size={square ? 22 : 24} /> : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  } else if (spec.templateId === "catalog-place") {
    // The listing card: one bold statement (the hook and the place as a single
    // headline, the way the reference layouts set it), the facts, and the
    // guest rating as a pill in the accent colour over the foot gradient. No
    // mark and no top scrim: this is a feed card, and the feed already shows
    // the brand's name and avatar above the creative.
    const pad = square ? 56 : 64;
    const scale = square ? 0.9 : 1;
    const statement = placeStatement(spec);
    const facts = clamp(spec.subtitle, 80);
    const rating = spec.rating ? Math.round(spec.rating * 10) / 10 : null;
    content = (
      <div
        style={{
          display: "flex",
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "#000000",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={context.sourceImage!}
          alt=""
          width={format.width}
          height={format.height}
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: imagePosition,
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "58%",
            background: `linear-gradient(180deg, ${scrim(0)} 0%, ${scrim(0.5)} 40%, ${scrim(0.85)} 100%)`,
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            left: pad,
            right: pad,
            bottom: pad,
            color: "#ffffff",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: Math.round(60 * scale),
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
            }}
          >
            {statement.map((text) => (
              <div key={text} style={{ display: "flex" }}>
                {text}
              </div>
            ))}
          </div>
          {facts ? (
            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontSize: Math.round(28 * scale),
                fontWeight: 500,
                opacity: 0.9,
              }}
            >
              {facts}
            </div>
          ) : null}
          {rating ? (
            <div style={{ display: "flex", marginTop: 20 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: `${Math.round(12 * scale)}px ${Math.round(26 * scale)}px`,
                  borderRadius: 999,
                  background: accent,
                  fontSize: Math.round(28 * scale),
                  fontWeight: 600,
                }}
              >
                <Stars count={1} size={Math.round(26 * scale)} />
                <div style={{ display: "flex" }}>{`${rating.toFixed(1)} guest rating`}</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  } else if (
    spec.templateId === "tall-statement" ||
    spec.templateId === "tall-welcome"
  ) {
    const centred = spec.templateId === "tall-statement";
    const story = spec.formatId === "story";
    const pad = story ? 72 : 64;
    const headline = wrapText(
      clamp(spec.title, 110),
      centred ? (story ? 24 : 22) : 20,
    );
    const subtitle = wrapText(clamp(spec.subtitle, 160), 46);
    content = (
      <div
        style={{
          display: "flex",
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "#000000",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={context.sourceImage!}
          alt=""
          width={format.width}
          height={format.height}
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: imagePosition,
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: "58%",
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0) 100%)",
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "28%",
            background:
              "linear-gradient(0deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            top: pad,
            left: pad,
            right: pad,
            alignItems: centred ? "center" : "flex-start",
            color: "#ffffff",
          }}
        >
          <BrandMark
            brandName={context.brand.name} logo={context.logo} tone={spec.mark}
            inverse
            markSize={40}
            textSize={26}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: centred ? "center" : "flex-start",
              marginTop: centred ? 64 : 40,
              fontSize: story ? 68 : 60,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              textAlign: centred ? "center" : "left",
            }}
          >
            {headline.map((text) => (
              <div key={text} style={{ display: "flex" }}>
                {text}
              </div>
            ))}
          </div>
          {!centred && subtitle.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: 22,
                fontSize: story ? 30 : 27,
                lineHeight: 1.3,
                opacity: 0.92,
              }}
            >
              {subtitle.map((text) => (
                <div key={text} style={{ display: "flex" }}>
                  {text}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {spec.cta ? (
          <div
            style={{
              display: "flex",
              position: "absolute",
              left: pad,
              right: pad,
              bottom: pad,
              justifyContent: centred ? "center" : "flex-start",
            }}
          >
            {centred ? (
              <div style={{ display: "flex", color: "#ffffff", fontSize: 28, fontWeight: 600 }}>
                {clamp(spec.cta, 60)}
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  padding: "22px 40px",
                  borderRadius: 999,
                  background: "#ffffff",
                  color: "#111111",
                  fontSize: 26,
                  fontWeight: 700,
                }}
              >
                {clamp(spec.cta, 60)}
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  } else if (spec.templateId === "photo-only") {
    content = (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "#000000",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={context.sourceImage!}
          alt=""
          width={format.width}
          height={format.height}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: imagePosition,
          }}
        />
      </div>
    );
  } else {
    content = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding,
          color: "#ffffff",
          background: `linear-gradient(145deg, #0b0b0c 0%, #151515 54%, ${accent} 180%)`,
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            position: "absolute",
            width: portrait ? 620 : 520,
            height: portrait ? 620 : 520,
            right: -150,
            top: -180,
            borderRadius: 999,
            background: accent,
            opacity: 0.22,
          }}
        />
        <BrandMark brandName={context.brand.name} logo={context.logo} tone={spec.mark} inverse />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            maxWidth: portrait ? "96%" : "84%",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 90,
              height: 8,
              marginBottom: 34,
              borderRadius: 8,
              background: accent,
            }}
          />
          <Message spec={spec} color="#ffffff" titleSize={portrait ? 92 : 80} />
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 19,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            opacity: 0.5,
          }}
        >
          Made with {context.brand.name}
        </div>
      </div>
    );
  }

  // A loaded brand font is set on a wrapper so every blueprint inherits it;
  // satori falls back to the house font for any family it was not given.
  const fontFamily = context.fonts?.[0]?.name;
  return new ImageResponse(
    fontFamily ? (
      <div style={{ display: "flex", width: "100%", height: "100%", fontFamily }}>
        {content}
      </div>
    ) : (
      content
    ),
    {
      width: format.width,
      height: format.height,
      ...(context.fonts?.length ? { fonts: context.fonts } : {}),
    },
  );
}

/**
 * A ready render of exactly this spec for this brand as it is now, if one
 * exists. Resolves the context the same way `freezeComposition` does (so the
 * caller must own the brand and the source must be ready) and matches on the
 * stored render inputs, so a plain rerun finds the earlier card while a
 * changed subtitle, a bumped template, a rename or a new accent renders again.
 */
export async function findFrozenComposition(input: {
  userId: string;
  spec: FreezeCompositionInput;
}) {
  const context = await resolveCompositionContext(input.userId, input.spec);
  const wanted = JSON.stringify(renderInputs(input.spec, context));
  return db.query.mediaAssetTable.findFirst({
    where: and(
      eq(mediaAssetTable.brandId, input.spec.brandId),
      eq(mediaAssetTable.provider, "r2"),
      eq(mediaAssetTable.kind, "image"),
      eq(mediaAssetTable.status, "ready"),
      isNull(mediaAssetTable.deletedAt),
      sql`${mediaAssetTable.metadata} -> 'composition' @> ${wanted}::jsonb`,
    ),
    orderBy: (asset, { desc }) => [desc(asset.createdAt)],
    columns: { id: true, url: true, metadata: true },
  });
}

/**
 * What the art director decided about a card, stored beside its recipe. A
 * `keep` sits on the card it judged; an `adjust` sits on the re-render, with
 * `directedFrom` pointing at the card it replaced so a rerun finds it.
 */
export type CardDirectionRecord = {
  verdict: "keep" | "adjust";
  note: string;
  changes: string[];
  directedFrom?: string;
};

export async function freezeComposition(input: {
  userId: string;
  spec: FreezeCompositionInput;
  direction?: CardDirectionRecord;
}) {
  const context = await loadCompositionSource(
    await resolveCompositionContext(input.userId, input.spec),
  );
  const format = getCompositionFormat(input.spec.formatId);
  const image = renderComposition(input.spec, context);
  const bytes = Buffer.from(await image.arrayBuffer());
  const filename = `${safeFilename(input.spec.assetTitle)}-${input.spec.formatId}.png`;

  return importImageBuffer({
    brandId: input.spec.brandId,
    uploadedBy: input.userId,
    body: bytes,
    contentType: "image/png",
    filename,
    title: input.spec.assetTitle,
    alt: input.spec.title,
    width: format.width,
    height: format.height,
    metadata: {
      composition: {
        ...renderInputs(input.spec, context),
        renderedAt: new Date().toISOString(),
        ...(input.direction
          ? {
              direction: {
                verdict: input.direction.verdict,
                note: input.direction.note,
                changes: input.direction.changes,
              },
              directedFrom: input.direction.directedFrom ?? null,
            }
          : {}),
      },
    },
  });
}

/**
 * The card the art director already judged for this photo, drawn with the
 * brand as it is now, whatever the copy said. The copy pass is not
 * deterministic, so a rerun matching on words would render and judge again
 * for a home that already has its card; matching on everything but the words
 * and the director's own fields is what makes a rerun a no-op.
 */
export async function findJudgedComposition(input: {
  userId: string;
  spec: FreezeCompositionInput;
}) {
  const context = await resolveCompositionContext(input.userId, input.spec);
  const {
    title: _title,
    subtitle: _subtitle,
    focal: _focal,
    scrim: _scrim,
    ...lineage
  } = renderInputs(input.spec, context);
  const wanted = JSON.stringify(lineage);
  return db.query.mediaAssetTable.findFirst({
    where: and(
      eq(mediaAssetTable.brandId, input.spec.brandId),
      eq(mediaAssetTable.provider, "r2"),
      eq(mediaAssetTable.kind, "image"),
      eq(mediaAssetTable.status, "ready"),
      isNull(mediaAssetTable.deletedAt),
      sql`${mediaAssetTable.metadata} -> 'composition' @> ${wanted}::jsonb`,
      sql`${mediaAssetTable.metadata} -> 'composition' ? 'direction'`,
    ),
    orderBy: (asset, { desc }) => [desc(asset.createdAt)],
    columns: { id: true, url: true, metadata: true },
  });
}

/** Record a `keep` on the card the art director judged and left alone. */
export async function recordCardDirection(
  assetId: string,
  direction: Omit<CardDirectionRecord, "directedFrom">,
) {
  await db
    .update(mediaAssetTable)
    .set({
      metadata: sql`jsonb_set(coalesce(${mediaAssetTable.metadata}, '{}'::jsonb), '{composition,direction}', ${JSON.stringify(direction)}::jsonb, true)`,
    })
    .where(eq(mediaAssetTable.id, assetId));
}

/**
 * The re-render the art director made from this card on an earlier run, if
 * any. Found by lineage rather than by recipe, because the recipe is what the
 * director changed.
 */
export async function findDirectedCard(baseAssetId: string) {
  return db.query.mediaAssetTable.findFirst({
    where: and(
      eq(mediaAssetTable.provider, "r2"),
      eq(mediaAssetTable.kind, "image"),
      eq(mediaAssetTable.status, "ready"),
      isNull(mediaAssetTable.deletedAt),
      sql`${mediaAssetTable.metadata} -> 'composition' ->> 'directedFrom' = ${baseAssetId}`,
    ),
    orderBy: (asset, { desc }) => [desc(asset.createdAt)],
    columns: { id: true, url: true, metadata: true },
  });
}

/**
 * A frozen card, reopened as the spec that made it. The identity stored on the
 * asset carries every field the form needs; the brand comes from the asset's
 * own row. Used by the Studio to pick a card back up from the library or an ad.
 */
export async function openComposition(input: {
  userId: string;
  assetId: string;
}): Promise<{
  spec: CompositionSpec;
  assetTitle: string;
  direction: { verdict: string; note: string; changes: string[] } | null;
}> {
  const asset = await db.query.mediaAssetTable.findFirst({
    where: and(
      eq(mediaAssetTable.id, input.assetId),
      isNull(mediaAssetTable.deletedAt),
    ),
    columns: { id: true, brandId: true, title: true, metadata: true },
  });
  const stored = (asset?.metadata as { composition?: Record<string, unknown> } | null)
    ?.composition;
  if (!asset?.brandId || !stored) {
    throw new CompositionAccessError("That asset is not a composition", 404);
  }
  const parsed = compositionSpecSchema.safeParse({
    brandId: asset.brandId,
    templateId: stored.templateId,
    formatId: stored.formatId,
    sourceMediaAssetId: stored.sourceMediaAssetId ?? undefined,
    title: stored.title ?? "",
    subtitle: stored.subtitle ?? undefined,
    eyebrow: stored.eyebrow ?? undefined,
    cta: stored.cta ?? undefined,
    accent: stored.accent ?? undefined,
    imagePosition: stored.imagePosition ?? "center",
    focal: stored.focal ?? undefined,
    scrim: stored.scrim ?? undefined,
    rating: stored.rating ?? undefined,
    mark: stored.mark ?? "auto",
  });
  if (!parsed.success) {
    throw new CompositionAccessError(
      "This card was rendered by an older blueprint and cannot be reopened",
      422,
    );
  }
  // The access check is the same one a render makes.
  await resolveCompositionContext(input.userId, parsed.data);
  const direction = stored.direction as
    | { verdict: string; note: string; changes: string[] }
    | undefined;
  return {
    spec: parsed.data,
    assetTitle: asset.title ?? "Composition",
    direction: direction ?? null,
  };
}
