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
    if (parsed.pathname.startsWith("/i/") && src) return new URL(src).toString();
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
    const key = ((data[i]! >> 4) << 8) | ((data[i + 1]! >> 4) << 4) | (data[i + 2]! >> 4);
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
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));
  // Two colours only: the shape in `color`, everything else transparent, so
  // the tracer has one clean boundary to follow.
  const pixels = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    pixels[i] = r!;
    pixels[i + 1] = g!;
    pixels[i + 2] = b!;
    pixels[i + 3] = data[i + 3]! >= 128 ? 255 : 0;
  }
  const svg = ImageTracer.imagedataToSVG(
    { width: info.width, height: info.height, data: pixels },
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

/** The image's alpha over a flat colour: its shape, in that colour. */
export async function tintSilhouette(png: Buffer, color: string): Promise<Buffer> {
  const { width, height } = await sharp(png).metadata();
  if (!width || !height) throw new Error("Cannot read the image's size.");
  // Exported "transparent" backgrounds often carry a whisper of alpha; painted
  // white over a photo that whisper is a grey box around the mark. Floor it.
  const alpha = await sharp(png).ensureAlpha().extractChannel(3).raw().toBuffer();
  for (let i = 0; i < alpha.length; i++) if (alpha[i]! < 24) alpha[i] = 0;
  return sharp({ create: { width, height, channels: 3, background: color } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}

/** A stored asset by id, as a satori-ready logo. */
export async function loadLogoAsset(url: string): Promise<LogoImage> {
  return loadLogoImage(url);
}
