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
