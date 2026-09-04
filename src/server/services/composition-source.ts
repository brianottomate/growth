import "server-only";

import sharp from "sharp";

/** What satori decodes. Anything else it logs and skips, silently. */
const SATORI_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/svg+xml",
]);

/**
 * An `<img src>` satori can render for a stored source image.
 *
 * The library keeps whatever the import gave it, and WanderOS feeds are WebP.
 * satori (behind `next/og`) decodes PNG, JPEG, GIF and SVG only; a source it
 * cannot decode is logged and skipped, so the card renders without its photo
 * and nothing fails. Convert those to JPEG here, and inline every source as a
 * data URI so the render does not depend on satori's own fetch either.
 */
export async function toSatoriImageSource(input: {
  body: Buffer;
  contentType: string;
}): Promise<string> {
  const type = input.contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (SATORI_IMAGE_TYPES.has(type)) {
    return `data:${type};base64,${input.body.toString("base64")}`;
  }
  const jpeg = await sharp(input.body)
    .rotate()
    .resize({ width: 2160, withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

export async function fetchSatoriImageSource(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`Source image download failed (${response.status}).`);
  }
  return toSatoriImageSource({
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "",
  });
}
