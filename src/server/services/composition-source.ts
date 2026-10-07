import "server-only";

import ImageTracer from "imagetracerjs";
import sharp from "sharp";

/**
 * The file behind a WanderOS image-proxy URL. The site editor serves every
 * asset through `/i/<transforms>?src=<original>`, and Firecrawl reports what
 * the page used, so a favicon arrives as a 32px copy of a 192px file. The
 * original is what a mark should be cut from.
 */
export function unwrapImageProxy(url: string): string {
  try {
    const parsed = new URL(url);
    const src = parsed.searchParams.get("src");
    if (parsed.pathname.startsWith("/i/") && src)
      return new URL(src).toString();
  } catch {
    // Not a URL we can read; the caller's fetch will say so.
  }
  return url;
}

/**
 * The one colour a flat mark is drawn in, or null when it has more than one.
 * A favicon or a single-ink logo traces to a colour vector that stays sharp
 * at any size; a photo-like or multi-colour mark stays a bitmap.
 */
export async function dominantColor(png: Buffer): Promise<string | null> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const counts = new Map<number, number>();
  let opaque = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3]! < 128) continue;
    opaque += 1;
    // 4 bits per channel: anti-aliased edges fall into the same bucket.
    const key =
      ((data[i]! >> 4) << 8) | ((data[i + 1]! >> 4) << 4) | (data[i + 2]! >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (opaque < 16) return null;
  let bestKey = 0;
  let best = 0;
  for (const [key, count] of counts) {
    if (count > best) [bestKey, best] = [key, count];
  }
  // Edge pixels blend toward the background; allow a tenth of them to stray.
  if (best / opaque < 0.9) return null;
  const r = ((bestKey >> 8) & 15) * 17;
  const g = ((bestKey >> 4) & 15) * 17;
  const b = (bestKey & 15) * 17;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The image's alpha traced to an SVG path in one colour, or null when the
 * trace finds no shape. A flat mark becomes resolution-independent; satori
 * draws SVG at any size without the softness of an upscaled bitmap.
 *
 * imagetracerjs works on raw pixels and has no dependencies, which is why it
 * is here: potrace's jimp dependency does not survive Next's server bundling.
 */
export async function traceSilhouette(
  png: Buffer,
  color: string,
): Promise<string | null> {
  const { hasAlpha } = await sharp(png).metadata();
  if (!hasAlpha) return null;
  const { width, height, alpha } = await silhouetteAlpha(png);
  const [r, g, b] = [1, 3, 5].map((i) =>
    Number.parseInt(color.slice(i, i + 2), 16),
  );
  // Two colours only: the shape in `color`, everything else transparent, so
  // the tracer has one clean boundary to follow.
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let p = 0, i = 0; p < alpha.length; p++, i += 4) {
    pixels[i] = r!;
    pixels[i + 1] = g!;
    pixels[i + 2] = b!;
    pixels[i + 3] = alpha[p]! >= 128 ? 255 : 0;
  }
  const svg = ImageTracer.imagedataToSVG(
    { width, height, data: pixels },
    {
      pal: [
        { r, g, b, a: 0 },
        { r, g, b, a: 255 },
      ],
      numberofcolors: 2,
      colorsampling: 0,
      ltres: 0.5,
      qtres: 0.5,
      pathomit: 4,
      roundcoords: 2,
      strokewidth: 0,
      blurradius: 0,
      linefilter: true,
      viewbox: true,
      desc: false,
    },
  )
    // The transparent layer's paths carry nothing; drop them.
    .replace(/<path[^>]*opacity="0"[^>]*\/>/g, "");
  return svg.includes("<path") ? svg : null;
}

/**
 * An `<img src>` satori can render for a stored source image.
 *
 * satori (behind `next/og`) decodes PNG, JPEG, GIF and SVG only, and a source
 * it cannot decode is logged and skipped, so the card renders without its
 * photo and nothing fails. The library stores what the import gave it, and
 * WanderOS feeds are WebP. Every source goes through sharp here, decided by
 * its bytes rather than its Content-Type: EXIF rotation applied, width capped,
 * PNG when the image has alpha, JPEG otherwise. Inlined as a data URI so the
 * render does not depend on satori's own fetch either.
 */
export async function toSatoriImageSource(body: Buffer): Promise<string> {
  const { hasAlpha } = await sharp(body).metadata();
  const image = sharp(body)
    .rotate()
    .resize({ width: 2160, withoutEnlargement: true });
  if (hasAlpha) {
    const png = await image.png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  }
  const jpeg = await image.jpeg({ quality: 88 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

export async function fetchSatoriImageSource(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`Source image download failed (${response.status}).`);
  }
  return toSatoriImageSource(Buffer.from(await response.arrayBuffer()));
}

export type LogoImage = {
  src: string;
  /**
   * The same mark as a white silhouette, for use over a photo. Brand logos
   * ship in brand colours for a light page; a dark teal mark over a grey sky
   * disappears. Absent when the logo has no transparency to cut from.
   */
  inverse: string | null;
  /** The near-black silhouette, for light grounds. */
  dark: string | null;
  width: number;
  height: number;
  /** Favicon-sized at the source: an icon, not a mark that can stand alone. */
  small: boolean;
};

/**
 * A brand logo as satori can draw it, with its intrinsic size so the mark
 * can scale it by height. SVGs are rasterised at high density because satori
 * draws them as bitmaps and a favicon-sized raster looks soft on a card.
 */
export async function loadLogoImage(url: string): Promise<LogoImage> {
  const response = await fetch(unwrapImageProxy(url), {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Logo download failed (${response.status}).`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  const meta = await sharp(body).metadata();
  const image =
    meta.format === "svg" ? sharp(body, { density: 288 }) : sharp(body);
  const png = await image
    .resize({ height: 1024, withoutEnlargement: meta.format !== "svg" })
    .png()
    .toBuffer();
  const out = await sharp(png).metadata();
  const toUri = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;
  return {
    src: toUri(png),
    inverse: out.hasAlpha ? toUri(await tintSilhouette(png, "#ffffff")) : null,
    dark: out.hasAlpha ? toUri(await tintSilhouette(png, "#111111")) : null,
    width: out.width ?? 1,
    height: out.height ?? 1,
    small: Math.max(meta.width ?? 0, meta.height ?? 0) < 96,
  };
}

/** Remove a flat light favicon background before measuring or tinting its glyph. */
export async function removeLightIconBackground(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const corners = [0, width - 1, (height - 1) * width, width * height - 1];
  // Existing transparency and coloured badges already define their own shape.
  if (
    !corners.every((p) => {
      const i = p * 4;
      return (
        data[i + 3] === 255 &&
        Math.min(data[i]!, data[i + 1]!, data[i + 2]!) >= 240 &&
        Math.max(data[i]!, data[i + 1]!, data[i + 2]!) -
          Math.min(data[i]!, data[i + 1]!, data[i + 2]!) <=
          8
      );
    })
  )
    return png;
  const background = [0, 1, 2].map((c) =>
    Math.round(corners.reduce((sum, p) => sum + data[p * 4 + c]!, 0) / 4),
  );
  for (let i = 0; i < data.length; i += 4) {
    const distance = Math.max(
      ...background.map((b, c) => Math.abs(data[i + c]! - b)),
    );
    const coverage = Math.min(1, Math.max(0, (distance - 8) / 72));
    data[i + 3] = Math.round(data[i + 3]! * coverage);
    // Unblend the soft edge from its former matte to avoid a pale fringe.
    if (coverage > 0 && coverage < 1)
      for (let c = 0; c < 3; c++)
        data[i + c] = Math.round(
          Math.min(
            255,
            Math.max(
              0,
              (data[i + c]! - background[c]! * (1 - coverage)) / coverage,
            ),
          ),
        );
  }
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

/**
 * The image with its empty margin removed, so its box is the mark itself.
 * A favicon is drawn inside a square with padding; measured with that padding
 * a mark looks small beside text set to the same height. Returns the original
 * when there is nothing to trim (a full-bleed image) or when trim fails.
 */
export async function trimTransparent(png: Buffer): Promise<Buffer> {
  try {
    // threshold 1: only pixels that match the corner exactly are margin.
    return await sharp(png).trim({ threshold: 1 }).png().toBuffer();
  } catch {
    return png;
  }
}

/** The image's alpha over a flat colour: its shape, in that colour. */

/**
 * The alpha a one-colour rendering of an icon should use.
 *
 * A mark that is a solid badge with a glyph inside (a dark circle carrying an
 * "H") has an alpha channel that is just the circle, so a white or dark tone
 * cut from alpha alone is a white dot with no H. Here the badge colour is the
 * most common opaque colour; pixels that stray far from it are the glyph and
 * are knocked out, so the tone renders as the badge shape with the glyph
 * showing through as the photo. A mark that is already one colour keeps its
 * alpha as it is, and a mark with no dominant colour is left alone too.
 */
export async function silhouetteAlpha(
  png: Buffer,
): Promise<{ width: number; height: number; alpha: Buffer }> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const alpha = Buffer.alloc(width * height);
  const counts = new Map<number, number>();
  let opaque = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // Exported "transparent" backgrounds carry a whisper of alpha; painted
    // white over a photo that whisper is a grey box around the mark. Floor it.
    const a = data[i + 3]! < 24 ? 0 : data[i + 3]!;
    alpha[p] = a;
    if (a < 128) continue;
    opaque += 1;
    const key =
      ((data[i]! >> 4) << 8) | ((data[i + 1]! >> 4) << 4) | (data[i + 2]! >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (opaque < 64) return { width, height, alpha };
  let bestKey = 0;
  let best = 0;
  for (const [key, count] of counts)
    if (count > best) [bestKey, best] = [key, count];
  const share = best / opaque;
  // Above 0.97 the mark is one colour already; below 0.45 there is no badge to
  // speak of and the glyph rule would eat half the mark.
  if (share > 0.97 || share < 0.45) return { width, height, alpha };
  const br = ((bestKey >> 8) & 15) * 17 + 8;
  const bg = ((bestKey >> 4) & 15) * 17 + 8;
  const bb = (bestKey & 15) * 17 + 8;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (alpha[p] === 0) continue;
    const d =
      Math.abs(data[i]! - br) +
      Math.abs(data[i + 1]! - bg) +
      Math.abs(data[i + 2]! - bb);
    // Badge pixels sit within ~60 of the badge colour; glyph pixels are far
    // off. Between the two the edge fades, which keeps the knock-out smooth.
    const keep = d <= 60 ? 1 : d >= 150 ? 0 : (150 - d) / 90;
    alpha[p] = Math.round(alpha[p]! * keep);
  }
  return { width, height, alpha };
}

export async function tintSilhouette(
  png: Buffer,
  color: string,
): Promise<Buffer> {
  const { width, height, alpha } = await silhouetteAlpha(png);
  return sharp({ create: { width, height, channels: 3, background: color } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}

/** A stored asset by id, as a satori-ready logo. */
export async function loadLogoAsset(url: string): Promise<LogoImage> {
  return loadLogoImage(url);
}
