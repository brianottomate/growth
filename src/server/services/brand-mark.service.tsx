import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { z } from "zod";

import { db } from "@/server/db";
import {
  brandTable,
  mediaAssetTable,
  type BrandMark,
} from "@/server/db/schema";
import {
  brandFontFamily,
  loadGoogleFont,
  type FontWeight,
  type LoadedFont,
} from "@/server/services/composition-fonts";
import {
  dominantColor,
  tintSilhouette,
  traceSilhouette,
  trimTransparent,
  unwrapImageProxy,
} from "@/server/services/composition-source";
import { importImageBuffer } from "@/server/services/media.service";

export type MarkTone = "color" | "white" | "dark";

export type MarkTuning = NonNullable<BrandMark["tuning"]>;

const NO_TUNING: MarkTuning = {
  iconScale: 1,
  iconShift: 0,
  gapScale: 1,
  note: "",
};

const CritiqueSchema = z.object({
  verdict: z.enum(["balanced", "adjust"]),
  /** Multiply the icon's height. 1 keeps it. */
  iconScale: z.number().min(0.7).max(1.4),
  /** Move the icon, in cap heights; positive is down. */
  iconShift: z.number().min(-0.3).max(0.3),
  /** Multiply the gap between icon and wordmark. */
  gapScale: z.number().min(0.6).max(1.6),
  /** True when the icon already carries the brand name, so a lockup repeats it. */
  iconIsWordmark: z.boolean(),
  note: z.string().max(600),
});

/**
 * An art director's read of a rendered lockup. Geometry gets the icon to the
 * cap band; what it cannot judge is whether the mark holds its own beside the
 * type, and that is a question of ink and shape, not of pixels. The model
 * answers in cap heights with hard bounds, so a bad read can only nudge.
 */
export async function critiqueLockup(input: {
  png: Buffer;
  brandName: string;
}): Promise<MarkTuning & { iconIsWordmark: boolean }> {
  try {
    // A transparent PNG flattens to nothing in a vision pipeline, and a white
    // mark on it to less. Judge on a light ground, as the colour render.
    const png = await sharp(input.png)
      .flatten({ background: "#f4f4f2" })
      .png()
      .toBuffer();
    const { output } = await generateText({
      model: anthropic("claude-sonnet-5"),
      output: Output.object({ schema: CritiqueSchema }),
      system:
        "You are an art director checking a logo lockup: an icon to the left of a wordmark. Judge optical balance the way a type designer would: the icon should read as the same visual weight as the letters, sit centred on the capitals, and be spaced like a wide letter. Answer only with the corrections needed. If it already looks right, say balanced and return 1, 0, 1.",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: png },
            {
              type: "text",
              text: `Brand: ${input.brandName}. The wordmark is the brand name. Is the icon the right size, height and distance from the wordmark? If the icon itself already contains the brand name as text, say so.`,
            },
          ],
        },
      ],
      temperature: 0,
    });
    return {
      iconScale: output.iconScale,
      iconShift: output.iconShift,
      gapScale: output.gapScale,
      note: output.note,
      iconIsWordmark: output.iconIsWordmark,
    };
  } catch (error) {
    console.error("lockup critique failed, keeping the measured layout", error);
    return { ...NO_TUNING, iconIsWordmark: false };
  }
}

export type BrandMarkRecipe = {
  source: BrandMark["source"];
  iconAssetId?: string | null;
  /** "logo-icon": the logo's leading glyph, isolated from its wordmark. */
  iconFrom?: "logo" | "favicon" | "logo-icon" | null;
  text?: string | null;
  fontFamily?: string | null;
  /** Lockup only: the wordmark weight; default 700. */
  fontWeight?: MarkFontWeight | null;
  /** Lockup only: tracking in em; default -0.02. */
  letterSpacing?: number | null;
};

export type MarkFontWeight = FontWeight;

type MarkBrand = {
  id: string;
  name: string;
  logo: string | null;
  organizationId: string | null;
  brandIdentity: {
    colors?: { primary?: string; accent?: string };
    logo?: string | null;
    favicon?: string | null;
    fonts?: Array<{ family: string; role?: "body" | "heading" }>;
  } | null;
  websiteMeta: { favicon?: string } | null;
};

async function loadMarkBrand(brandId: string): Promise<MarkBrand> {
  const brand = await db.query.brandTable.findFirst({
    where: and(eq(brandTable.id, brandId), isNull(brandTable.deletedAt)),
    columns: {
      id: true,
      name: true,
      logo: true,
      organizationId: true,
      brandIdentity: true,
      websiteMeta: true,
    },
  });
  if (!brand) throw new Error("Brand not found");
  return brand;
}

/** The text colour a lockup uses in each tone. Colour means the brand's own. */
export function markTextColor(
  tone: MarkTone,
  identity: MarkBrand["brandIdentity"],
): string {
  if (tone === "white") return "#ffffff";
  if (tone === "dark") return "#111111";
  return identity?.colors?.primary ?? identity?.colors?.accent ?? "#111111";
}

/** Where the icon comes from for a recipe, or null for a text-only lockup. */
export async function resolveMarkIconUrl(
  recipe: BrandMarkRecipe,
  brand: MarkBrand,
): Promise<string | null> {
  const favicon =
    brand.brandIdentity?.favicon ?? brand.websiteMeta?.favicon ?? null;
  // Same fallback shape as the favicon above, and for the same reason. The
  // `logo` COLUMN is whatever selectBrandLogo could offer at the time the
  // brand was last enriched, which falls through to the OG image when no
  // branding profile had been read yet, and an OG image is a photo, so the
  // mark comes out a screenshot. `brandIdentity.logo` is the real artwork
  // Firecrawl names, written by a later enrichment that never backfills the
  // column. Prefer it; the column stays the fallback.
  const logo = brand.brandIdentity?.logo ?? brand.logo;
  if (recipe.source === "favicon") return favicon;
  if (recipe.source === "logo") return logo;
  if (recipe.iconFrom === "logo" || recipe.iconFrom === "logo-icon")
    return logo;
  if (recipe.iconFrom === "favicon") return favicon;
  if (!recipe.iconAssetId) return null;
  const asset = await db.query.mediaAssetTable.findFirst({
    where: and(
      eq(mediaAssetTable.id, recipe.iconAssetId),
      eq(mediaAssetTable.brandId, brand.id),
      eq(mediaAssetTable.status, "ready"),
      eq(mediaAssetTable.reviewStatus, "approved"),
      isNull(mediaAssetTable.deletedAt),
    ),
    columns: { url: true },
  });
  return asset?.url ?? null;
}

/**
 * The largest image inside a .ico, which most favicons still are and sharp
 * cannot read. Modern icons embed PNGs, which come straight out; the older
 * BMP form is not worth decoding by hand, so the caller says so plainly.
 */
function pngInsideIco(body: Buffer): Buffer | null {
  if (
    body.length < 6 ||
    body.readUInt16LE(0) !== 0 ||
    body.readUInt16LE(2) !== 1
  ) {
    return null;
  }
  const count = body.readUInt16LE(4);
  let best: { size: number; offset: number; area: number } | null = null;
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    if (entry + 16 > body.length) break;
    // 0 in the width or height byte means 256.
    const area = (body[entry]! || 256) * (body[entry + 1]! || 256);
    const size = body.readUInt32LE(entry + 8);
    const offset = body.readUInt32LE(entry + 12);
    if (!best || area > best.area) best = { size, offset, area };
  }
  if (!best || best.offset + best.size > body.length) return null;
  const image = body.subarray(best.offset, best.offset + best.size);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  return image.subarray(0, 4).equals(png) ? image : null;
}

async function fetchPng(url: string): Promise<Buffer> {
  const response = await fetch(unwrapImageProxy(url), {
    signal: AbortSignal.timeout(10_000),
    // Some brand CDNs refuse a bare fetch; this is the same request a page
    // showing the logo would make.
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      // Not the browser's avif-first list: a CDN that honours it hands back
      // a format sharp may not read, for a file we only want to trace.
      Accept: "image/*",
    },
  });
  if (!response.ok)
    throw new Error(`Icon download failed (${response.status}).`);
  const raw = Buffer.from(await response.arrayBuffer());
  const body = pngInsideIco(raw) ?? raw;
  const meta = await sharp(body)
    .metadata()
    .catch(() => {
      throw new Error(
        raw === body && raw.readUInt16LE?.(0) === 0
          ? "That favicon is an .ico this cannot read. Use the logo, or upload an image and build a lockup."
          : "That icon is not an image format this can read.",
      );
    });
  const image =
    meta.format === "svg" ? sharp(body, { density: 288 }) : sharp(body);
  const png = await image
    .resize({ height: 1024, withoutEnlargement: meta.format !== "svg" })
    .png()
    .toBuffer();
  // Tight bounds, so every later measurement is of the mark and not its
  // padding: the icon's size against the text, and the traced viewBox.
  return trimTransparent(png);
}

/**
 * The leading glyph of a logo: the first run of ink before the first clear
 * gap, which on an icon-plus-wordmark logo is the icon. A stacked logo (a
 * monogram over the name) is read from its top row only, so the icon is the
 * monogram and not the first letter of the name below it. A logo with no
 * such gap (a single wordmark) comes back whole.
 */
async function leadingGlyph(png: Buffer): Promise<Buffer> {
  return (await cutLeadingGlyph(png)) ?? png;
}

/** The cut, or null when the logo has no icon separate from its wordmark. */
async function cutLeadingGlyph(png: Buffer): Promise<Buffer | null> {
  // Components are found on a small copy: the shapes are the same, the work
  // is a fraction, and the box is scaled back up before the cut.
  const full = await sharp(png).metadata();
  const scale = Math.min(1, 240 / Math.max(full.height ?? 1, 1));
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .resize({ height: Math.max(1, Math.round((full.height ?? 1) * scale)) })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const ink = (x: number, y: number) => data[(y * width + x) * 4 + 3]! > 24;
  const seen = new Uint8Array(width * height);
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const boxes: Box[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (seen[y * width + x] || !ink(x, y)) continue;
      const box: Box = { x0: x, x1: x, y0: y, y1: y };
      const stack = [[x, y]];
      seen[y * width + x] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        box.x0 = Math.min(box.x0, cx!);
        box.x1 = Math.max(box.x1, cx!);
        box.y0 = Math.min(box.y0, cy!);
        box.y1 = Math.max(box.y1, cy!);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
        ]) {
          const nx = cx! + dx!,
            ny = cy! + dy!;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (seen[ny * width + nx] || !ink(nx, ny)) continue;
          seen[ny * width + nx] = 1;
          stack.push([nx, ny]);
        }
      }
      boxes.push(box);
    }
  if (!boxes.length) return null;
  // Rows of a stacked logo: ink bands split by a clear horizontal gap.
  const rowInk = new Uint8Array(height);
  for (const box of boxes) rowInk.fill(1, box.y0, box.y1 + 1);
  const rowGap = Math.max(2, Math.round(height * 0.04));
  let firstRowEnd = height - 1;
  for (let y = 0, blank = 0, started = false; y < height; y++) {
    if (rowInk[y]) {
      if (started && blank >= rowGap) {
        firstRowEnd = y - blank - 1;
        break;
      }
      started = true;
      blank = 0;
    } else if (started) blank += 1;
  }
  const stacked = firstRowEnd < height - 1;
  if (stacked) {
    const top = boxes.filter((box) => box.y1 <= firstRowEnd);
    boxes.length = 0;
    boxes.push(...top);
  }
  // The icon is the leftmost shape, plus any shape sharing its columns (a
  // dot over an i, a detached ray): those are its pieces, not the next glyph.
  boxes.sort((a, b) => a.x0 - b.x0);
  const icon = { ...boxes[0]! };
  const margin = Math.max(1, Math.round(height * 0.02));
  for (const box of boxes.slice(1)) {
    if (box.x0 > icon.x1 + margin) continue;
    icon.x1 = Math.max(icon.x1, box.x1);
    icon.y0 = Math.min(icon.y0, box.y0);
    icon.y1 = Math.max(icon.y1, box.y1);
  }
  // No separable icon within the row: the leftmost shape runs most of the
  // width. A stacked logo's whole top row is then the icon; a flat logo has
  // none to cut.
  const topRowBottom = stacked
    ? Math.min(full.height ?? 1, Math.ceil((firstRowEnd + 1) / scale))
    : (full.height ?? 1);
  if (icon.x1 - icon.x0 > width * 0.5) {
    if (!stacked) return null;
    icon.x0 = Math.min(...boxes.map((box) => box.x0));
    icon.x1 = Math.max(...boxes.map((box) => box.x1));
  }
  const left = Math.floor(icon.x0 / scale);
  const right = Math.min(full.width ?? 1, Math.ceil((icon.x1 + 1) / scale));
  return trimTransparent(
    await sharp(png)
      .extract({ left, top: 0, width: right - left, height: topRowBottom })
      .png()
      .toBuffer(),
  );
}

/** The icon in the tone: as-is for colour, a silhouette otherwise. */
async function iconForTone(png: Buffer, tone: MarkTone): Promise<Buffer> {
  if (tone === "color") return png;
  const { hasAlpha } = await sharp(png).metadata();
  // A logo without transparency (a JPEG proxy, say) cannot be cut; the
  // original is the honest fallback rather than a solid rectangle.
  if (!hasAlpha) return png;
  return tintSilhouette(png, tone === "white" ? "#ffffff" : "#111111");
}

/**
 * The icon at an exact height, as sharp bytes. A traced vector is rasterised
 * at the size it will be drawn, so it stays crisp; otherwise the bitmap is
 * resized. Returns null when the recipe has no icon.
 */
async function iconAtHeight(
  png: Buffer,
  tone: MarkTone,
  height: number,
): Promise<Buffer> {
  const color =
    tone === "white"
      ? "#ffffff"
      : tone === "dark"
        ? "#111111"
        : await dominantColor(png);
  const svg = color
    ? await traceSilhouette(png, color).catch(() => null)
    : null;
  if (svg) {
    // A trace of an intricate mark can be too much for the rasteriser; the
    // bitmap below is always there.
    const raster = await sharp(Buffer.from(svg))
      .resize({ height })
      .png()
      .toBuffer()
      .catch(() => null);
    if (raster) return raster;
  }
  const bitmap = await iconForTone(png, tone);
  return sharp(bitmap).resize({ height }).png().toBuffer();
}

/**
 * The drawn part of an image: the crop itself and where it sat. sharp trims
 * natively, so this costs no 10 MB pixel scan of a wide text canvas.
 */
async function inkOf(png: Buffer) {
  const { data, info } = await sharp(png)
    .trim({ threshold: 1 })
    .png()
    .toBuffer({ resolveWithObject: true });
  return {
    crop: data,
    width: info.width,
    height: info.height,
    top: Math.abs(info.trimOffsetTop ?? 0),
    left: Math.abs(info.trimOffsetLeft ?? 0),
  };
}

/**
 * How much of its own box a mark inks. A solid wordmark approaches 1; a
 * hairline outline is a few percent, and set to the same height as the
 * letters beside it, it reads much smaller than them.
 */
async function inkCoverage(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i]! >= 128) opaque += 1;
  return opaque / Math.max(1, info.width * info.height);
}

/**
 * One line of type as a PNG, checked before it is handed on. The renderer
 * occasionally returns a buffer nothing can read, and a second attempt has
 * always produced a good one; a mark is worth one retry.
 */
async function renderTextPng(input: {
  text: string;
  color: string;
  fontSize: number;
  fontWeight: MarkFontWeight;
  letterSpacing: number;
  fonts: LoadedFont[] | null;
}): Promise<Buffer> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const png = Buffer.from(await renderTextLayer(input).arrayBuffer());
    const readable = await sharp(png)
      .metadata()
      .then(() => true)
      .catch(() => false);
    if (readable) return png;
  }
  throw new Error("The wordmark could not be rendered. Try again.");
}

/** One line of type on a transparent canvas, laid out from the top left. */
function renderTextLayer(input: {
  text: string;
  color: string;
  fontSize: number;
  fontWeight: MarkFontWeight;
  letterSpacing: number;
  fonts: LoadedFont[] | null;
}) {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        width: "100%",
        height: "100%",
        color: input.color,
        fontSize: input.fontSize,
        fontWeight: input.fontWeight,
        lineHeight: 1,
        letterSpacing: `${input.letterSpacing}em`,
        whiteSpace: "nowrap",
        ...(input.fonts?.length ? { fontFamily: input.fonts[0]!.name } : {}),
      }}
    >
      <div style={{ display: "flex" }}>{input.text}</div>
    </div>,
    {
      // Sized to the line: a fixed wide canvas costs memory on every render
      // and buys nothing. 0.8em per character clears the widest faces.
      width: Math.min(
        8000,
        Math.round(
          input.text.length *
            input.fontSize *
            (0.8 + Math.max(0, input.letterSpacing)),
        ) + 200,
      ),
      height: input.fontSize * 2,
      ...(input.fonts?.length ? { fonts: input.fonts } : {}),
    },
  );
}

/**
 * One variant of the mark as a transparent PNG.
 *
 * Logo and favicon marks are the icon alone. A lockup sets the icon beside
 * the text in the brand's heading font, on a transparent canvas trimmed to
 * its content, so every variant of a mark has the same proportions.
 */
export async function renderBrandMark(
  recipe: BrandMarkRecipe,
  brand: MarkBrand,
  tone: MarkTone,
  tuning: MarkTuning = NO_TUNING,
): Promise<Buffer> {
  const iconUrl = await resolveMarkIconUrl(recipe, brand);
  let iconPng = iconUrl ? await fetchPng(iconUrl) : null;
  if (iconPng && recipe.iconFrom === "logo-icon")
    iconPng = await leadingGlyph(iconPng);

  if (recipe.source !== "lockup") {
    if (!iconPng) throw new Error("This brand has no logo or favicon to use.");
    return iconForTone(iconPng, tone);
  }

  const text = (recipe.text ?? brand.name).trim() || brand.name;
  const family =
    recipe.fontFamily === undefined
      ? brandFontFamily(brand.brandIdentity)
      : recipe.fontFamily;
  const fontWeight = recipe.fontWeight ?? 700;
  const letterSpacing = recipe.letterSpacing ?? -0.02;
  const fonts = family ? await loadGoogleFont(family, [fontWeight]) : null;
  const color = markTextColor(tone, brand.brandIdentity);
  const fontSize = 200;

  // The font's own metrics, measured rather than assumed: a capital H is
  // flat top and bottom, so its ink runs exactly cap top to baseline. Every
  // face we might load has different metrics, and a lockup that guesses them
  // puts the mark at the wrong height or the wrong altitude.
  // A capital from the brand's own name, so the glyph is one this font
  // certainly has; H only as a last resort. Its ink runs cap top to
  // baseline, because a capital is flat top and bottom and sits on the line.
  const probe = /\p{Lu}/u.exec(text)?.[0] ?? "H";
  // One at a time: satori's renderer is a shared WASM instance, and two
  // renders in flight together corrupt each other's output.
  const type = { color, fontSize, fontWeight, letterSpacing, fonts };
  const textPng = await renderTextPng({ text, ...type });
  const probePng = await renderTextPng({ text: probe, ...type });
  const textInk = await inkOf(textPng);
  // A script with no capitals leaves the whole line as the only measure.
  const capInk = await inkOf(probePng).catch(() => textInk);
  const capHeight = capInk.height;
  const capCentre = capInk.top + capInk.height / 2;

  if (!iconPng) return textInk.crop;

  // Set against the capitals, not the line box, and sized by how much ink
  // the mark carries: a solid one sits at cap height, a sparse outline goes
  // up to a fifth taller so it holds its own beside the letters. An icon cut
  // from the brand's own logo is drawn in the same hand as its letters, so it
  // sits at exactly cap height, top and bottom on the same lines.
  const cutFromLogo = recipe.iconFrom === "logo-icon";
  const coverage = cutFromLogo ? 1 : await inkCoverage(iconPng);
  const scale = 1 + 0.2 * (1 - Math.min(coverage / 0.5, 1));
  const source = await sharp(iconPng).metadata();
  const aspect = (source.width ?? 1) / (source.height ?? 1);
  // A wide mark sized by height would dwarf the wordmark it introduces, so
  // width is the binding constraint past two cap heights.
  const iconHeight = Math.round(
    Math.min(capHeight * scale, (capHeight * 2) / Math.max(aspect, 0.01)) *
      tuning.iconScale,
  );
  // A cut letterform needs more air than a badge before the name starts.
  const gap = Math.round(
    capHeight * (cutFromLogo ? 0.6 : 0.34) * tuning.gapScale,
  );
  const icon = await iconAtHeight(iconPng, tone, iconHeight);
  const iconMeta = await sharp(icon).metadata();
  const iconWidth = iconMeta.width ?? iconHeight;
  const iconTop = Math.round(
    capCentre - iconHeight / 2 + tuning.iconShift * capHeight,
  );

  // A hair of margin: trimmed ink still anti-aliases one column past its
  // box, and a canvas cut exactly to it clips that column.
  const margin = 4;
  const originY = Math.min(iconTop, textInk.top) - margin;
  const height =
    Math.max(iconTop + iconHeight, textInk.top + textInk.height) -
    originY +
    margin;
  return sharp({
    create: {
      width: iconWidth + gap + textInk.width + margin * 2,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: icon, left: margin, top: iconTop - originY },
      {
        input: textInk.crop,
        left: margin + iconWidth + gap,
        top: textInk.top - originY,
      },
    ])
    .png()
    .toBuffer();
}

/** Render one tone for a live preview; nothing is stored. */
export async function previewBrandMark(input: {
  brandId: string;
  recipe: BrandMarkRecipe;
  tone: MarkTone;
  /** Corrections the editor is holding, from an earlier "Fix with AI". */
  tuning?: MarkTuning | null;
}): Promise<Buffer> {
  const brand = await loadMarkBrand(input.brandId);
  return renderBrandMark(
    input.recipe,
    brand,
    input.tone,
    input.tuning ?? NO_TUNING,
  );
}

/**
 * The art director's corrections for a lockup as the editor has it. A
 * separate step from saving, so the operator sees the fix before keeping it:
 * the editor re-previews with these numbers and sends them along on save.
 */
export async function critiqueBrandMark(input: {
  brandId: string;
  recipe: BrandMarkRecipe;
}): Promise<MarkTuning> {
  const brand = await loadMarkBrand(input.brandId);
  const colorRender = await renderBrandMark(input.recipe, brand, "color");
  const read = await critiqueLockup({
    png: colorRender,
    brandName: brand.name,
  });
  const note = read.iconIsWordmark
    ? `The icon already carries the brand name; a lockup repeats it. ${read.note}`.trim()
    : read.note;
  return {
    iconScale: read.iconScale,
    iconShift: read.iconShift,
    gapScale: read.gapScale,
    note: note || "Balanced as it is.",
  };
}

/**
 * Render all three tones into the brand's library and make them the mark.
 * Re-running replaces the recipe and the variants; earlier variants stay in
 * the library as ordinary assets.
 */
export async function setBrandMark(input: {
  brandId: string;
  userId: string;
  recipe: BrandMarkRecipe;
  /** What the operator accepted from "Fix with AI", if they asked for it. */
  tuning?: MarkTuning | null;
  /** Why this mark, when it was suggested rather than picked by hand. */
  reason?: string | null;
}): Promise<BrandMark> {
  const brand = await loadMarkBrand(input.brandId);
  const tuning =
    input.recipe.source === "lockup" ? (input.tuning ?? null) : null;
  const tones: MarkTone[] = ["color", "white", "dark"];
  const ids: Partial<Record<MarkTone, string>> = {};
  let vector: BrandMark["vector"] = null;
  for (const tone of tones) {
    const body = await renderBrandMark(
      input.recipe,
      brand,
      tone,
      tuning ?? NO_TUNING,
    );
    // An icon-only mark may come from a small file; a lockup is rendered
    // large already. Trace the mono icons so cards draw them at any size.
    if (tone === "color" && input.recipe.source !== "lockup") {
      // Best effort: the PNG variants are the mark; the vector is a bonus.
      vector = await Promise.all([
        traceSilhouette(body, "#ffffff"),
        traceSilhouette(body, "#111111"),
        dominantColor(body).then((c) => (c ? traceSilhouette(body, c) : null)),
      ])
        .then(([white, dark, color]) =>
          white && dark ? { white, dark, color: color ?? null } : null,
        )
        .catch((error: unknown) => {
          console.error("mark trace failed, keeping bitmap variants", error);
          return null;
        });
    }
    const { width, height } = await sharp(body).metadata();
    const asset = await importImageBuffer({
      brandId: brand.id,
      uploadedBy: input.userId,
      body,
      contentType: "image/png",
      filename: `${brand.name}-mark-${tone}.png`,
      title: `${brand.name} mark (${tone})`,
      width,
      height,
      metadata: { source: "brand_mark", tone, recipe: input.recipe },
    });
    ids[tone] = asset.id;
  }
  const mark: BrandMark = {
    source: input.recipe.source,
    iconAssetId: input.recipe.iconAssetId ?? null,
    iconFrom: input.recipe.iconFrom ?? null,
    text: input.recipe.text ?? null,
    // Undefined means "the brand's heading font", which is what was drawn; the
    // stored mark names it so the editor reopens on the same face.
    fontFamily:
      input.recipe.fontFamily === undefined
        ? brandFontFamily(brand.brandIdentity)
        : input.recipe.fontFamily,
    fontWeight: input.recipe.fontWeight ?? null,
    letterSpacing: input.recipe.letterSpacing ?? null,
    variants: { color: ids.color!, white: ids.white!, dark: ids.dark! },
    vector,
    tuning,
    reason: input.reason ?? null,
    updatedAt: new Date().toISOString(),
  };
  await db
    .update(brandTable)
    .set({ brandMark: mark })
    .where(eq(brandTable.id, brand.id));
  return mark;
}

export async function clearBrandMark(brandId: string): Promise<void> {
  await db
    .update(brandTable)
    .set({ brandMark: null })
    .where(eq(brandTable.id, brandId));
}

const pickSchema = z.object({
  choice: z.number().int().describe("The candidate's number."),
  reason: z.string().describe("One short sentence."),
});

/**
 * The mark a brand starts with, chosen the way an operator would on Setup:
 * the site logo alone, or a lockup of the favicon beside the name in the
 * brand's heading font, whichever still reads at the size a card draws it.
 * A wide wordmark served small is the common loser. Runs once, on creation
 * or enrichment, before anyone opens the page; the operator can change it.
 */
export async function chooseBrandMark(input: {
  brandId: string;
  userId: string;
}): Promise<{ recipe: BrandMarkRecipe; reason: string } | null> {
  const brand = await loadMarkBrand(input.brandId);
  const favicon =
    brand.brandIdentity?.favicon ?? brand.websiteMeta?.favicon ?? null;
  const logoUrl = brand.brandIdentity?.logo ?? brand.logo;
  // Offered only when the logo has an icon apart from its name: otherwise the
  // "cut" is the whole logo again, beside the name it already carries.
  const cuttable = logoUrl
    ? await fetchPng(logoUrl)
        .then(cutLeadingGlyph)
        .then(Boolean)
        .catch(() => false)
    : false;
  const recipes: BrandMarkRecipe[] = [
    ...(logoUrl ? [{ source: "logo" } as const] : []),
    ...(cuttable ? [{ source: "lockup", iconFrom: "logo-icon" } as const] : []),
    ...(favicon ? [{ source: "lockup", iconFrom: "favicon" } as const] : []),
    { source: "lockup", iconFrom: null },
    {
      source: "lockup",
      iconFrom: null,
      text: brand.name.toUpperCase(),
      fontWeight: 600,
      letterSpacing: 0.14,
    },
  ];
  // Each candidate at card scale: a mark on a card is about 44 px tall on a
  // 1080 px canvas, so a candidate that is thin there is thin for real.
  const HEIGHT = 44;
  const tiles: { recipe: BrandMarkRecipe; png: Buffer }[] = [];
  for (const recipe of recipes) {
    try {
      const png = await renderBrandMark(recipe, brand, "white");
      const meta = await sharp(png).metadata();
      const width = Math.round(
        (HEIGHT * (meta.width ?? 1)) / Math.max(meta.height ?? 1, 1),
      );
      tiles.push({
        recipe,
        png: await sharp(png)
          .resize(Math.min(width, 520), HEIGHT, { fit: "inside" })
          .toBuffer(),
      });
    } catch (error) {
      console.warn("brand mark candidate failed", recipe, error);
    }
  }
  if (!tiles.length) return null;
  const ROW = HEIGHT + 40;
  const sheet = await sharp({
    create: {
      width: 600,
      height: ROW * tiles.length,
      channels: 3,
      background: "#1c1c1c",
    },
  })
    .composite(
      tiles.flatMap((tile, i) => [
        {
          input: Buffer.from(
            `<svg width="40" height="${ROW}"><text x="8" y="${ROW / 2 + 6}" font-size="18" fill="#888">${i + 1}</text></svg>`,
          ),
          left: 0,
          top: i * ROW,
        },
        { input: tile.png, left: 48, top: i * ROW + 20 },
      ]),
    )
    .png()
    .toBuffer();
  const { output } = await generateText({
    model: anthropic("claude-sonnet-5"),
    system:
      "You pick a brand's mark for the corner of an ad card, shown here at the size the card draws it, in white on dark. Choose the candidate that reads best at this size: legible, not thin or faint, clearly the brand. A wordmark that has gone hairline, or a logo that has become a white box or a smudge, loses to a lockup of an icon and the name, or to the name alone. A lockup whose icon is itself a wordmark repeats the name; prefer the name alone then. When the icon cut from the brand's own logo is offered and reads cleanly, prefer it to a favicon badge or to the name alone: it is the brand's real mark. The reason is for the operator: say in plain words why this one, in one sentence.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Brand: ${brand.name}. Candidates: ${tiles.map((t, i) => `${i + 1} = ${describeRecipe(t.recipe)}`).join("; ")}.`,
          },
          { type: "file", data: sheet, mediaType: "image/png" },
        ],
      },
    ],
    output: Output.object({ schema: pickSchema }),
    providerOptions: { anthropic: { effort: "low" } },
  });
  const chosen = tiles[output.choice - 1] ?? tiles[0]!;
  // Only a favicon badge is judged and nudged: a cut icon is already set to
  // the cap height, and a name alone has no icon to move.
  const tuning =
    chosen.recipe.source === "lockup" && chosen.recipe.iconFrom === "favicon"
      ? await critiqueBrandMark({
          brandId: input.brandId,
          recipe: chosen.recipe,
        })
      : null;
  await setBrandMark({
    brandId: input.brandId,
    userId: input.userId,
    recipe: chosen.recipe,
    tuning,
    reason: output.reason,
  });
  return { recipe: chosen.recipe, reason: output.reason };
}

function describeRecipe(recipe: BrandMarkRecipe): string {
  if (recipe.source !== "lockup") return `site ${recipe.source} alone`;
  if (recipe.iconFrom === "logo-icon")
    return "the icon cut from the logo + name";
  if (recipe.iconFrom) return `${recipe.iconFrom} icon + name`;
  return recipe.letterSpacing ? "name alone, spaced capitals" : "name alone";
}
