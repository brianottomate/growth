import "server-only";

import sharp from "sharp";

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
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(`Logo download failed (${response.status}).`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  const meta = await sharp(body).metadata();
  const image =
    meta.format === "svg" ? sharp(body, { density: 288 }) : sharp(body);
  const png = await image
    .resize({ height: 144, withoutEnlargement: meta.format !== "svg" })
    .png()
    .toBuffer();
  const out = await sharp(png).metadata();
  return {
    src: `data:image/png;base64,${png.toString("base64")}`,
    width: out.width ?? 1,
    height: out.height ?? 1,
    small: Math.max(meta.width ?? 0, meta.height ?? 0) < 96,
  };
}
