import "server-only";

import { isPlaceCard } from "@/lib/catalog-studio";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { ImageResponse } from "next/og";
import sharp from "sharp";

import {
  type CompositionSpec,
  type FreezeCompositionInput,
  compositionPreviewFromParams,
  compositionSpecSchema,
  getCompositionFormat,
  getCompositionIdentity,
  STORY_SAFE_ZONE,
} from "@/lib/compositions";
import { R2 } from "@/server/clients/r2.client";
import { db } from "@/server/db";
import { brandTable, mediaAssetTable, memberTable } from "@/server/db/schema";
import {
  brandBodyFontFamily,
  brandFontFamily,
  brandHeadingWeight,
  loadGoogleFont,
  type FontWeight,
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
  /** The blueprint, so loading can fetch what only that one draws. */
  templateId: CompositionSpec["templateId"];
  /** Where the source lives. A lookup needs only this; a render loads it. */
  sourceUrl: string | null;
  /** Ready, brand-owned R2 source, resolved after access checks. */
  sourceAsset?: {
    id: string;
    url: string;
    width: number | null;
    height: number | null;
    mimeType: string | null;
  };
};

/** A context with everything satori draws loaded: source, logo, brand font. */
export type RenderContext = CompositionContext & {
  sourceImage: string | null;
  logo: LogoImage | null;
  fonts: LoadedFont[] | null;
  /** The family the smaller text is set in when it differs from the heading's. */
  bodyFont?: string | null;
  /** The heading's weight when the brand sets one. */
  headingWeight?: FontWeight | null;
  /**
   * The tier badge only: the source blurred, which is what the pill's frosted
   * glass shows through (satori has no backdrop-filter), and the pill's face.
   */
  badge?: { backdrop: string; fonts: LoadedFont[] | null };
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

/**
 * Two lines of about equal length instead of a full first line and a stray
 * word or two below it. Falls back to plain wrapping past two lines.
 */
function balancedLines(value: string, maxCharacters: number) {
  const greedy = wrapText(value, maxCharacters);
  if (greedy.length !== 2) return greedy;
  const words = value.split(/\s+/);
  let best = greedy;
  let bestGap = Math.abs(greedy[0]!.length - greedy[1]!.length);
  for (let at = 1; at < words.length; at++) {
    const first = words.slice(0, at).join(" ");
    const second = words.slice(at).join(" ");
    if (first.length > maxCharacters || second.length > maxCharacters) continue;
    // A slightly longer first line reads better than a longer second one.
    const gap =
      Math.abs(first.length - second.length) +
      (second.length > first.length ? 1 : 0);
    if (gap < bestGap) {
      best = [first, second];
      bestGap = gap;
    }
  }
  return best;
}

/**
 * The pills that fit one row, in order: a pill that would wrap is left off.
 * Widths are estimated from the character count at the pill's font size.
 */
function pillsOnOneRow(
  labels: readonly string[],
  rowWidth: number,
  fontSize: number,
  paddingX: number,
  gap: number,
) {
  const width = (label: string) =>
    Math.ceil(label.length * fontSize * 0.56) + paddingX * 2 + 4;
  const kept: string[] = [];
  let used = 0;
  for (const label of labels) {
    const next = used + (kept.length ? gap : 0) + width(label);
    if (next > rowWidth) break;
    kept.push(label);
    used = next;
  }
  return kept;
}

/**
 * Hosts an on-demand preview may draw a photo from without importing it: a
 * brand's own listing photos on WanderOS and our own library. Anything else
 * is refused, so the preview route cannot be pointed at an arbitrary server.
 */
const PREVIEW_SOURCE_HOSTS = new Set([
  "assets.wander.com",
  "assets-websites.wander.com",
]);

export function isAllowedPreviewSource(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return PREVIEW_SOURCE_HOSTS.has(parsed.hostname) || R2.isPublicUrl(url);
  } catch {
    return false;
  }
}

export async function resolveCompositionContext(
  userId: string,
  spec: CompositionSpec,
  options: {
    /** A vouched-for photo URL, used when the spec names no library asset. */
    sourceUrl?: string | null;
  } = {},
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
  let sourceAsset: CompositionContext["sourceAsset"];
  if (spec.sourceMediaAssetId) {
    const source = await db.query.mediaAssetTable.findFirst({
      where: and(
        eq(mediaAssetTable.id, spec.sourceMediaAssetId),
        eq(mediaAssetTable.brandId, brand.id),
        eq(mediaAssetTable.provider, "r2"),
        eq(mediaAssetTable.kind, "image"),
        eq(mediaAssetTable.status, "ready"),
        eq(mediaAssetTable.reviewStatus, "approved"),
        isNull(mediaAssetTable.deletedAt),
      ),
      columns: {
        id: true,
        url: true,
        width: true,
        height: true,
        mimeType: true,
      },
    });
    if (!source?.url || !R2.isPublicUrl(source.url)) {
      throw new CompositionAccessError(
        /^https?:\/\//.test(spec.sourceMediaAssetId)
          ? "sourceMediaAssetId takes a library asset id (media_…), not a URL. Import the photo into the brand's library first and pass its id."
          : "Choose a ready image from this brand's library",
        422,
      );
    }
    sourceUrl = source.url;
    sourceAsset = { ...source, url: source.url };
  } else if (options.sourceUrl) {
    if (!isAllowedPreviewSource(options.sourceUrl)) {
      throw new CompositionAccessError(
        "Previews draw only from the brand's own listing photos or the library",
        422,
      );
    }
    sourceUrl = options.sourceUrl;
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
    templateId: spec.templateId,
    sourceUrl,
    sourceAsset,
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
    inverse: mark.vector
      ? svg(mark.vector.white)
      : (white?.src ?? color.inverse),
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
  options: {
    /** Preview only: a family to try in place of the brand's own. */
    fontFamily?: string | null;
  } = {},
): Promise<RenderContext> {
  const identity = context.brand.brandIdentity;
  const family = options.fontFamily ?? brandFontFamily(identity);
  const headingWeight = options.fontFamily
    ? null
    : brandHeadingWeight(identity);
  const body = options.fontFamily ? null : brandBodyFontFamily(identity);
  // The logo and the font are best effort: a card without them is still the
  // card. The source is not; its failure is the render's failure.
  const [sourceImage, logo, headingFonts, bodyFonts] = await Promise.all([
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
    family
      ? loadGoogleFont(
          family,
          headingWeight ? [400, headingWeight, 700] : undefined,
        )
      : null,
    body ? loadGoogleFont(body, [400, 500, 600]) : null,
  ]);
  // The heading's faces stay first: the card's wrapper takes the first name.
  const fonts = headingFonts ? [...headingFonts, ...(bodyFonts ?? [])] : null;
  const faces = {
    fonts,
    bodyFont: headingFonts && bodyFonts ? body : null,
    headingWeight: headingFonts ? headingWeight : null,
  };
  if (context.templateId === "tier-badge" && sourceImage) {
    const [backdrop, badgeFonts] = await Promise.all([
      blurredSatoriSource(sourceImage, BADGE_BACKDROP_SIGMA),
      loadGoogleFont(BADGE_FONT_FAMILY, [BADGE_FONT_WEIGHT]),
    ]);
    return {
      ...context,
      sourceImage,
      logo,
      ...faces,
      badge: { backdrop, fonts: badgeFonts },
    };
  }
  return { ...context, sourceImage, logo, ...faces };
}

// ---- The wander.com tier pill ---------------------------------------------
//
// `PropertyCard_TierBadge` on wander.com, measured on a live card: a 28px
// pill 12px in from the photo's corner, 10px/12px padding, a 16px icon 6px
// from 14px Instrument Sans at 550, white on a 12px backdrop blur with an 18%
// black wash and a 5% black hairline. Drawn against a 400px-wide card rather
// than the site's 234px so the pill sits at the size the newsletter's Figma
// exports carried it: legible at the 116px list thumbnail, quiet at 536px.

const BADGE_FONT_FAMILY = "Instrument Sans";
// 550 is a variable-font weight Google serves only as 500 or 600; 600 holds
// up better when the email shrinks the photo to a thumbnail.
const BADGE_FONT_WEIGHT = 600;
const BADGE_REFERENCE_WIDTH = 400;
// Sigma on the 600px backdrop copy that satori then scales across the canvas.
const BADGE_BACKDROP_SIGMA = 18;

const TIER_BADGES = {
  luxury: {
    label: "Luxury",
    // wander.com `src/ui/Icon/icon/sparkle.svg`
    path: "M12 2.75C13 8 16 11 21.25 12C16 13 13 16 12 21.25C11 16 8 13 2.75 12C8 11 11 8 12 2.75Z",
  },
  iconic: {
    label: "Iconic",
    // wander.com `src/ui/Icon/icon/crown.svg`
    path: "M4.7075 17.2631L2.7498 7.7134L8.1648 10.8719L12.0001 5.006L15.8352 10.8719L21.2502 7.7134L19.2926 17.2631C19.0859 18.2707 18.1992 18.994 17.1707 18.994H6.8293C5.8009 18.994 4.9141 18.2707 4.7075 17.2631Z",
  },
} as const;

function tierIcon(tier: keyof typeof TIER_BADGES) {
  const svg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${TIER_BADGES[tier].path}" stroke="#ffffff" stroke-width="2" stroke-linecap="square" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function blurredSatoriSource(dataUri: string, sigma: number) {
  const body = Buffer.from(dataUri.slice(dataUri.indexOf(",") + 1), "base64");
  const jpeg = await sharp(body)
    .resize({ width: 600, withoutEnlargement: true })
    .blur(sigma)
    .jpeg({ quality: 80 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

function TierPill({
  tier,
  canvas,
  imagePosition,
  backdrop,
}: {
  tier: keyof typeof TIER_BADGES;
  canvas: { width: number; height: number };
  imagePosition: string;
  backdrop: string;
}) {
  const scale = canvas.width / BADGE_REFERENCE_WIDTH;
  const px = (value: number) => Math.round(value * scale);
  const inset = px(12);
  const border = Math.max(1, px(1));
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        left: inset,
        top: inset,
        height: px(28),
        alignItems: "center",
        paddingLeft: px(10),
        paddingRight: px(12),
        borderRadius: 999,
        border: `${border}px solid rgba(0, 0, 0, 0.05)`,
        overflow: "hidden",
      }}
    >
      {/* The frosted glass: the same crop of a blurred copy, offset so it
          lines up with the photo underneath. */}
      {/* oxlint-disable-next-line nextjs/no-img-element */}
      <img
        src={backdrop}
        alt=""
        width={canvas.width}
        height={canvas.height}
        style={{
          position: "absolute",
          left: -(inset + border),
          top: -(inset + border),
          width: canvas.width,
          height: canvas.height,
          objectFit: "cover",
          objectPosition: imagePosition,
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.18)",
        }}
      />
      {/* oxlint-disable-next-line nextjs/no-img-element */}
      <img
        src={tierIcon(tier)}
        alt=""
        width={px(16)}
        height={px(16)}
        style={{ width: px(16), height: px(16), marginRight: px(6) }}
      />
      <div
        style={{
          display: "flex",
          fontFamily: BADGE_FONT_FAMILY,
          fontSize: px(14),
          fontWeight: BADGE_FONT_WEIGHT,
          lineHeight: 1.2,
          color: "#ffffff",
        }}
      >
        {TIER_BADGES[tier].label}
      </div>
    </div>
  );
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
    const height = alone ? Math.round(markSize * (wide ? 1.2 : 2.4)) : markSize;
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
        {/* oxlint-disable-next-line nextjs/no-img-element */}
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
  // Satori wraps by the face's real widths. Lines split ahead by character
  // count get wrapped again when the face runs wide, stranding a word.
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
          width: "100%",
          maxWidth: "100%",
          fontSize: titleSize,
          fontWeight: 760,
          lineHeight: 0.98,
          letterSpacing: "-0.045em",
          textWrap: "balance",
        }}
      >
        {clamp(spec.title, 120)}
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
          {clamp(spec.subtitle, 220)}
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
    brandLogo:
      context.brand.brandMark?.variants.color ?? context.brand.logo ?? null,
    fontFamily: brandFontFamily(context.brand.brandIdentity),
    // Only when set, so cards of brands without them keep matching.
    ...(brandBodyFontFamily(context.brand.brandIdentity)
      ? { bodyFontFamily: brandBodyFontFamily(context.brand.brandIdentity) }
      : {}),
    ...(brandHeadingWeight(context.brand.brandIdentity)
      ? { headingWeight: brandHeadingWeight(context.brand.brandIdentity) }
      : {}),
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
  if (spec.templateId && isPlaceCard(spec.templateId))
    return placeStatement(spec);
  return balancedLines(
    clamp(spec.title, 90),
    spec.formatId === "square" ? 24 : 22,
  );
}

/** Where a hook hands over to the place: the word that goes down with the place. */
const HOOK_PREPOSITIONS = new Set([
  "in",
  "at",
  "on",
  "near",
  "by",
  "above",
  "below",
  "beside",
  "overlooking",
  "outside",
  "inside",
  "from",
  "of",
  "for",
  "to",
  "off",
  "along",
  "across",
]);

/**
 * The place card's one headline: the hook and the place read as a single
 * statement, set on two lines that break where the sense does ("A 4-bedroom
 * villa sleeping 8" / "in Winter Park, CO"), never mid-phrase by character
 * count. A hook too long for one line wraps first and the place still takes
 * its own line. Exported so the art director is told the same breaks.
 */
export function placeStatement(
  spec: Pick<CompositionSpec, "title" | "formatId"> &
    Partial<Pick<CompositionSpec, "eyebrow">>,
) {
  // Characters that fit one line at the card's headline size: the copy rules
  // allow a 28-character lead, so a square card must hold it on one line.
  const perLine = spec.formatId === "square" ? 30 : 28;
  const place = clamp(spec.title.trim(), 40);
  const hook = clamp(spec.eyebrow?.trim() ?? "", 60);
  if (!hook) return wrapText(place, perLine);
  const words = hook.split(/\s+/);
  const last = words.at(-1)?.toLowerCase() ?? "";
  const handover = HOOK_PREPOSITIONS.has(last) ? words.pop()! : null;
  const placeLine = handover ? `${handover} ${place}` : place;
  return [
    ...wrapText(words.join(" "), perLine),
    ...wrapText(placeLine, perLine),
  ].slice(0, 3);
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
  // Keep Story artwork out of the bands Meta lays its header and call to
  // action over.
  const overlayInsets =
    spec.formatId === "story"
      ? {
          paddingTop: Math.round(format.height * STORY_SAFE_ZONE.top),
          paddingBottom: Math.round(format.height * STORY_SAFE_ZONE.bottom),
          paddingLeft: 96,
          paddingRight: 96,
        }
      : { padding };
  // A 16:9 ad is 1920 wide but shows at feed width like a 1080 card, so its
  // type is set about 1.4x larger to read the same. A 1.91:1 link card is
  // only 630 tall, so its type steps down.
  const video = spec.formatId === "wide";
  const titleSize = portrait
    ? 78
    : video
      ? 96
      : spec.formatId === "landscape"
        ? 54
        : 68;
  // A focal point pans the cover crop so that point of the photo lands at the
  // same fraction of the canvas, which keeps it in frame whatever the ratio.
  const imagePosition = spec.focal
    ? `${spec.focal.x}% ${spec.focal.y}%`
    : {
        top: "center top",
        center: "center center",
        bottom: "center bottom",
        left: "left center",
        right: "right center",
      }[spec.imagePosition];
  const scrim = scrimRgba(spec.scrim);

  let content: React.ReactNode;
  if (spec.templateId === "hero-overlay") {
    // Silvina's awareness template (2026-09): headline top left over a soft
    // top scrim, a white pill at the foot; the story canvas centres the
    // headline and drops the pill for plain text.
    const story = spec.formatId === "story";
    const wide = format.width > format.height;
    const overlayPadding = story ? 96 : video ? 100 : wide ? 72 : 68;
    const link = spec.formatId === "landscape";
    const headlineSize = story
      ? 80
      : link
        ? 54
        : video
          ? 100
          : square
            ? 68
            : 72;
    const button = spec.cta?.trim();
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
        {/* oxlint-disable-next-line nextjs/no-img-element */}
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
            // Satori does not honour the `inset` shorthand, so an absolute box
            // with only `inset: 0` collapses to nothing and paints no scrim.
            // Keep contrast around the headline, leaving the property's
            // middle clear and only a light fade beneath the CTA.
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: `linear-gradient(180deg, ${scrim(0.62)} 0%, ${scrim(0.46)} 22%, ${scrim(0.16)} 42%, ${scrim(0)} 56%, ${scrim(0)} 80%, ${scrim(0.2)} 100%)`,
          }}
        />
        {/* Wide canvases set the headline in the left half, below the top
            band's reach on a bright window: darken the text side too. */}
        {wide ? (
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              background: `linear-gradient(90deg, ${scrim(0.5)} 0%, ${scrim(0.3)} 38%, ${scrim(0)} 66%)`,
            }}
          />
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            alignItems: story ? "center" : "flex-start",
            position: "absolute",
            top: 0,
            left: 0,
            width: format.width,
            height: format.height,
            padding: overlayPadding,
            ...(story ? { paddingTop: 270, paddingBottom: 420 } : {}),
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              maxWidth: story ? "88%" : link ? "72%" : video ? "76%" : "90%",
              marginTop: 0,
              color: "#ffffff",
              fontSize: headlineSize,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              textAlign: story ? "center" : "left",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: story ? "center" : "flex-start",
                marginBottom: 32,
              }}
            >
              <BrandMark
                brandName={context.brand.name}
                logo={context.logo}
                tone={spec.mark}
                inverse
                {...(video ? { markSize: 52, textSize: 36 } : {})}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: story ? "center" : "flex-start",
                textWrap: "balance",
              }}
            >
              {clamp(spec.title, 90)}
            </div>
          </div>
          {button ? (
            story ? (
              // Stories and Reels lay their own UI over the bottom fifth of
              // the frame, so the line sits above that band.
              <div
                style={{
                  display: "flex",
                  color: "#ffffff",
                  fontSize: 34,
                  fontWeight: 600,
                  marginBottom: 300,
                }}
              >
                {button}
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: video
                    ? "30px 58px"
                    : wide
                      ? "20px 38px"
                      : "24px 44px",
                  borderRadius: 999,
                  background: "#ffffff",
                  color: "#111111",
                  fontSize: video ? 46 : wide ? 30 : 34,
                  fontWeight: 600,
                }}
              >
                {button}
              </div>
            )
          ) : (
            <div style={{ display: "flex" }} />
          )}
        </div>
      </div>
    );
  } else if (spec.templateId === "email-header") {
    // An email's header card (Brian Sun's promo headers, 2026-09): the photo
    // with the offer on it, lower left over a soft bottom scrim. Scaled to the
    // canvas so a banner and a 3:2 photo keep the same proportions.
    const unit = format.width / 1200;
    const detail = spec.subtitle?.trim();
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
        {/* oxlint-disable-next-line nextjs/no-img-element */}
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
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: `linear-gradient(180deg, ${scrim(0)} 0%, ${scrim(0)} 38%, ${scrim(0.34)} 64%, ${scrim(0.72)} 100%)`,
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            alignItems: "flex-start",
            position: "absolute",
            top: 0,
            left: 0,
            width: format.width,
            height: format.height,
            padding: Math.round(56 * unit),
            color: "#ffffff",
          }}
        >
          {spec.eyebrow?.trim() ? (
            <div
              style={{
                display: "flex",
                fontSize: Math.round(22 * unit),
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: Math.round(10 * unit),
                opacity: 0.92,
              }}
            >
              {clamp(spec.eyebrow, 48)}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              maxWidth: "86%",
              fontSize: Math.round(64 * unit),
              fontWeight: 700,
              lineHeight: 1.06,
              letterSpacing: "-0.02em",
              textWrap: "balance",
            }}
          >
            {clamp(spec.title, 70)}
          </div>
          {detail ? (
            <div
              style={{
                display: "flex",
                marginTop: Math.round(20 * unit),
                padding: `${Math.round(10 * unit)}px ${Math.round(22 * unit)}px`,
                borderRadius: 999,
                background: "#ffffff",
                color: "#111111",
                fontSize: Math.round(24 * unit),
                fontWeight: 600,
              }}
            >
              {clamp(detail, 70)}
            </div>
          ) : null}
        </div>
      </div>
    );
  } else if (spec.templateId === "image-hero") {
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
        {/* oxlint-disable-next-line nextjs/no-img-element */}
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
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            // On a Story the headline ends above Meta's bottom band, so
            // the shade rises to meet it.
            background:
              spec.formatId === "story"
                ? `linear-gradient(180deg, ${scrim(0.2)} 0%, ${scrim(0)} 14%, ${scrim(0)} 34%, ${scrim(0.5)} 56%, ${scrim(0.62)} 68%, ${scrim(0.7)} 100%)`
                : `linear-gradient(180deg, ${scrim(0.2)} 0%, ${scrim(0)} 18%, ${scrim(0)} 48%, ${scrim(0.46)} 74%, ${scrim(0.78)} 100%)`,
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            ...overlayInsets,
            ...(video ? { padding: 96 } : {}),
          }}
        >
          <BrandMark
            brandName={context.brand.name}
            logo={context.logo}
            tone={spec.mark}
            inverse
            {...(video ? { markSize: 52, textSize: 36 } : {})}
          />
          <div
            style={{
              display: "flex",
              marginTop: "auto",
              maxWidth: portrait ? "92%" : "64%",
            }}
          >
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
          <BrandMark
            brandName={context.brand.name}
            logo={context.logo}
            tone={spec.mark}
          />
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
          {/* oxlint-disable-next-line nextjs/no-img-element */}
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
        {/* oxlint-disable-next-line nextjs/no-img-element */}
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
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
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
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            ...overlayInsets,
          }}
        >
          <BrandMark
            brandName={context.brand.name}
            logo={context.logo}
            tone={spec.mark}
            inverse
          />
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
            brandName={context.brand.name}
            logo={context.logo}
            tone={spec.mark}
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
          {/* oxlint-disable-next-line nextjs/no-img-element */}
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
        {/* oxlint-disable-next-line nextjs/no-img-element */}
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
            height: Math.round(format.height * 0.62),
            background: `linear-gradient(180deg, ${scrim(0)} 0%, ${scrim(0.6)} 45%, ${scrim(0.88)} 100%)`,
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
            height: Math.round(format.height * 0.26),
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
          <BrandMark
            brandName={context.brand.name}
            logo={context.logo}
            tone={spec.mark}
            inverse
          />
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
  } else if (
    isPlaceCard(spec.templateId) ||
    spec.templateId === "catalog-amenities" ||
    spec.templateId === "catalog-amenities-place" ||
    spec.templateId === "catalog-destination" ||
    spec.templateId === "catalog-headline"
  ) {
    // The listing card: one bold statement (the hook and the place as a single
    // headline, the way the reference layouts set it), the facts, and the
    // guest rating as a pill in the accent colour over the foot gradient. The
    // mark is drawn only when the spec asks for one: a feed card already has
    // the brand's name and avatar above it, a catalog card may want it.
    const pad = square ? 56 : 64;
    const scale = square ? 0.9 : 1;
    // The amenities cards set the headline alone and let pills carry the
    // amenities; the place card folds the place into the statement.
    const amenities = !isPlaceCard(spec.templateId);
    // The destination card names the place above one big line and keeps a
    // single pill; the amenities cards are sized to read at phone width.
    // The headline card is the destination card with only the words left:
    // the place above, one bigger line, no facts and no pills.
    const headlineOnly = spec.templateId === "catalog-headline";
    const destination =
      spec.templateId === "catalog-destination" || headlineOnly;
    // A face set regular reads smaller than the house bold at the same size.
    const regular = context.headingWeight && context.headingWeight < 600;
    const headlineSize = Math.round(
      (headlineOnly ? 84 : destination ? 76 : amenities ? 68 : 60) *
        scale *
        (regular ? 1.3 : 1),
    );
    const statement = amenities
      ? balancedLines(
          clamp(spec.title, 90),
          Math.round(((square ? 26 : 24) * 60 * scale) / headlineSize),
        )
      : placeStatement(spec);
    const facts = headlineOnly ? "" : clamp(spec.subtitle, 80);
    // The amenities cards leave the rating out; the place variant leads its
    // pill row with the location instead.
    const rating =
      !amenities && spec.rating && spec.templateId !== "catalog-place-plain"
        ? Math.round(spec.rating * 10) / 10
        : null;
    const location =
      spec.templateId === "catalog-amenities-place"
        ? clamp(spec.location, 32)
        : "";
    const eyebrow = destination ? clamp(spec.location, 40).toUpperCase() : "";
    const pillFont = Math.round(30 * scale);
    // One row: the location pill first, then the amenities that still fit.
    const pillRow = pillsOnOneRow(
      [
        location,
        ...(amenities && !headlineOnly ? (spec.pills ?? []).slice(0, 2) : []),
      ].filter(Boolean),
      format.width - pad * 2,
      pillFont,
      Math.round(28 * scale),
      12,
    );
    const pills = location ? pillRow.slice(1) : pillRow;
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
        {/* oxlint-disable-next-line nextjs/no-img-element */}
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
            height: Math.round(format.height * 0.58),
            background: `linear-gradient(180deg, ${scrim(0)} 0%, ${scrim(0.56)} 40%, ${scrim(0.9)} 100%)`,
          }}
        />
        {/* The mark is optional here: an ad in the feed already shows the
            brand above the card, but a catalog card can ask for it. Same
            corner and light top scrim as catalog-copy. */}
        {spec.mark !== "none" ? (
          <div
            style={{
              display: "flex",
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: Math.round(format.height * 0.26),
              background: `linear-gradient(180deg, ${scrim(0.45)} 0%, ${scrim(0)} 100%)`,
            }}
          />
        ) : null}
        {spec.mark !== "none" ? (
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: pad,
              left: pad,
            }}
          >
            <BrandMark
              brandName={context.brand.name}
              logo={context.logo}
              tone={spec.mark}
              inverse
            />
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            left: pad,
            right: pad,
            // Stories and Reels lay their own UI over the bottom fifth of the
            // frame; the foot block sits above that band on the story canvas.
            bottom: spec.formatId === "story" ? pad + 240 : pad,
            color: "#ffffff",
            ...(context.bodyFont ? { fontFamily: context.bodyFont } : {}),
          }}
        >
          {eyebrow ? (
            <div
              style={{
                display: "flex",
                marginBottom: 16,
                fontSize: Math.round(28 * scale),
                fontWeight: 600,
                letterSpacing: "0.14em",
                opacity: 0.92,
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: headlineSize,
              // A brand face set at its own weight (a regular serif) keeps
              // its drawn spacing; the house bold is tightened.
              fontWeight: context.headingWeight ?? 700,
              lineHeight: context.headingWeight ? 1.1 : 1.06,
              letterSpacing: context.headingWeight ? "0" : "-0.03em",
              ...(context.bodyFont && context.fonts?.[0]
                ? { fontFamily: context.fonts[0].name }
                : {}),
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
          {rating || location || pills.length ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                marginTop: 20,
              }}
            >
              {rating ? (
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
                  <div style={{ display: "flex" }}>
                    {`${rating.toFixed(1)} guest rating`}
                  </div>
                </div>
              ) : null}
              {location ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: `${Math.round(14 * scale)}px ${Math.round(28 * scale)}px`,
                    borderRadius: 999,
                    background: accent,
                    fontSize: pillFont,
                    fontWeight: 600,
                  }}
                >
                  {location}
                </div>
              ) : null}
              {pills.map((pill) => (
                <div
                  key={pill}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: `${Math.round(14 * scale)}px ${Math.round(28 * scale)}px`,
                    borderRadius: 999,
                    border: "2px solid rgba(255,255,255,0.4)",
                    background: "rgba(255,255,255,0.14)",
                    fontSize: pillFont,
                    fontWeight: 600,
                  }}
                >
                  {pill}
                </div>
              ))}
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
    const pad = story ? 72 : video ? 96 : 64;
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
        {/* oxlint-disable-next-line nextjs/no-img-element */}
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
            height: centred ? "66%" : "58%",
            background: centred
              ? `linear-gradient(180deg, ${scrim(0.74)} 0%, ${scrim(0.62)} 40%, ${scrim(0.3)} 75%, ${scrim(0)} 100%)`
              : "linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0) 100%)",
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: story ? "42%" : "28%",
            background: centred
              ? `linear-gradient(0deg, ${scrim(0.46)} 0%, ${scrim(0)} 100%)`
              : "linear-gradient(0deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            top: story ? 270 : pad,
            left: pad,
            right: pad,
            alignItems: centred ? "center" : "flex-start",
            color: "#ffffff",
          }}
        >
          <BrandMark
            brandName={context.brand.name}
            logo={context.logo}
            tone={spec.mark}
            inverse
            markSize={video ? 56 : 40}
            textSize={video ? 38 : 26}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: centred ? "center" : "flex-start",
              marginTop: centred ? 64 : 40,
              fontSize: story ? 68 : video ? 92 : 60,
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
        {spec.cta && !centred ? (
          <div
            style={{
              display: "flex",
              position: "absolute",
              left: pad,
              right: pad,
              // Meta lays its CTA sticker and the Reels caption over the
              // bottom third of a story, so the line sits above it.
              bottom: story ? 680 : pad,
              justifyContent: "flex-start",
            }}
          >
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
          </div>
        ) : null}
      </div>
    );
  } else if (spec.templateId === "tier-badge") {
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
        {/* oxlint-disable-next-line nextjs/no-img-element */}
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
        {spec.tier && context.badge ? (
          <TierPill
            tier={spec.tier}
            canvas={format}
            imagePosition={imagePosition}
            backdrop={context.badge.backdrop}
          />
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
        {/* oxlint-disable-next-line nextjs/no-img-element */}
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
        <BrandMark
          brandName={context.brand.name}
          logo={context.logo}
          tone={spec.mark}
          inverse
        />
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
      <div
        style={{ display: "flex", width: "100%", height: "100%", fontFamily }}
      >
        {content}
      </div>
    ) : (
      content
    ),
    {
      width: format.width,
      height: format.height,
      ...(context.fonts?.length || context.badge?.fonts?.length
        ? { fonts: [...(context.fonts ?? []), ...(context.badge?.fonts ?? [])] }
        : {}),
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
      eq(mediaAssetTable.reviewStatus, "approved"),
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
  const png = Buffer.from(new Uint8Array(await image.arrayBuffer()));
  // An email photo goes to an inbox: a 1200×800 PNG of a photograph weighs
  // megabytes, the same frame as a JPEG a couple of hundred kilobytes.
  const jpeg = format.id === "email" || format.id === "banner";
  const bytes = jpeg
    ? await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toBuffer()
    : png;
  const filename = `${safeFilename(input.spec.assetTitle)}-${input.spec.formatId}.${jpeg ? "jpg" : "png"}`;

  return importImageBuffer({
    brandId: input.spec.brandId,
    uploadedBy: input.userId,
    body: bytes,
    contentType: jpeg ? "image/jpeg" : "image/png",
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
  const stored = (
    asset?.metadata as { composition?: Record<string, unknown> } | null
  )?.composition;
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
    tier: stored.tier ?? undefined,
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

/**
 * Draw a composition preview URL (`/api/compositions/preview?...`) on the
 * server, as the route would for this user, and return the PNG. For reviews
 * that need to see drafted cards whose only image is their recipe URL.
 */
export async function renderCompositionUrl(userId: string, url: string) {
  const { sourceUrl, parsed } = compositionPreviewFromParams(
    new URL(url, "http://local").searchParams,
  );
  if (!parsed.success)
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid composition");
  const context = await resolveCompositionContext(userId, parsed.data, {
    sourceUrl,
  });
  const response = renderComposition(
    parsed.data,
    await loadCompositionSource(context),
  );
  // Copy the bytes: Buffer.from(arrayBuffer) is a view onto memory the
  // renderer reuses, so a kept buffer turned into the next card's pixels.
  return Buffer.from(new Uint8Array(await response.arrayBuffer()));
}
