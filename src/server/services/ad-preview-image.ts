import "server-only";
import sharp from "sharp";

const MAX_BYTES = 15 * 1024 * 1024;

/** Only call with an image already authorized by the signed preview. */
export async function previewImage(src: string) {
  const response = await fetch(src, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.startsWith("image/") ||
    Number(response.headers.get("content-length")) > MAX_BYTES ||
    !response.body
  )
    throw new Error("Preview image unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error("Preview image too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const image = sharp(Buffer.concat(chunks), { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width: 1200,
      height: 1200,
      fit: "inside",
      withoutEnlargement: true,
    });
  const { isOpaque } = await image.stats();
  const hasAlpha = !isOpaque;
  const body = await (
    hasAlpha ? image.png() : image.jpeg({ quality: 85 })
  ).toBuffer();
  return { body, type: hasAlpha ? "image/png" : "image/jpeg" };
}
