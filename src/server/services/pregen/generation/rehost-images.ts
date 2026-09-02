import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";

import { env } from "@/env";
import {
  r2BuildKey,
  r2IsPublicUrl,
  r2PutBuffer,
} from "@/server/clients/r2.client";

// Mirror the source site's images into our own R2 bucket, and shrink them on
// the way in. Ported from the monolith's prospect-enrichment/rehost-images.ts
// (+ the resize half of site-editor/shared/download-and-upload-image.ts), which
// is the same job against a different bucket.
//
// V0 hotlinked the source URLs. That breaks in a way no status check catches:
// a `cross-origin-resource-policy: same-origin` header (Cloudflare's security
// preset ships it) makes the browser silently discard the cross-origin embed
// while curl still sees a clean 200. Hotlink rules, image removals and signed
// CDN URLs all fail the same silent way. Serving our own bytes sidesteps every
// one of them, and a successful fetch doubles as the loadability check: a URL
// that is absent from the returned map is a URL the caller must drop.
//
// FAILS OPEN AS A WHOLE, PER-IMAGE CLOSED. With no R2 credentials configured
// the map is an identity map and we are back to V0 hotlinking, because a lab
// run on a laptop without secrets should still produce a page. But once R2 is
// configured, an image that cannot be fetched or prepared is left out and its
// card slot backfills.

const FETCH_CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 15_000_000;
const HASH_PREFIX_LENGTH = 16;

/**
 * Longest edge we store. These bytes have one consumer, a property card a few
 * hundred CSS pixels wide, and V0 stored whatever the source site served:
 * measured on a live monolith preview, two cards at 1,027,628 and 668,192 bytes
 * rendering into a 256px column, on a link a prospect most likely opens on a
 * phone. 1600 covers a wide card at 2x and still cuts a 4000px original by
 * about an order of magnitude.
 */
const MAX_EDGE = 1_600;

/**
 * Hard ceiling on decoded pixels for sharp over untrusted bytes. sharp's own
 * default allows ~268MP, and a 15MB compressed image can inflate to ~1GB of
 * RGBA in native memory. 64MP bounds one decode at roughly 256MB and still
 * covers any legitimate web photo.
 */
const MAX_INPUT_PIXELS = 64_000_000;

/** Below this, the bytes are a lazy-load placeholder rather than a photo. */
const MIN_SOURCE_BYTES = 15_000;

export type RehostedImages = {
  /** originalUrl → hosted URL. Absent means the image is unusable. */
  hosted: Map<string, string>;
  /** True when nothing was uploaded and the map is the input, unchanged. */
  passthrough: boolean;
};

export async function rehostImages(
  prospectId: string,
  urls: string[],
): Promise<RehostedImages> {
  const unique = [...new Set(urls)].filter((url) => url.startsWith("http"));

  if (!isR2Configured()) {
    return {
      hosted: new Map(unique.map((url) => [url, url])),
      passthrough: true,
    };
  }

  const hosted = new Map<string, string>();
  for (const batch of chunk(unique, FETCH_CONCURRENCY)) {
    await Promise.all(
      batch.map(async (url) => {
        // Bytes we already host need no second copy, and re-fetching one would
        // rewrite its content-addressed key to itself.
        if (r2IsPublicUrl(url)) {
          hosted.set(url, url);
          return;
        }
        // One retry: resize CDNs time out intermittently under concurrent load
        // and a dropped image can cost a whole property card.
        const result =
          (await fetchAndUpload(prospectId, url)) ??
          (await fetchAndUpload(prospectId, url));
        if (result) hosted.set(url, result);
      }),
    );
  }

  return { hosted, passthrough: false };
}

/**
 * The filename we store a source URL under. Content-addressed on the URL rather
 * than on the bytes, so the same source is never copied twice and, more useful,
 * so a hosted URL can be traced back to the page it came from: the image
 * provenance evaluator resolves R2 URLs this way, since a rehosted image no
 * longer appears literally in the crawl corpus.
 */
export const rehostedSourceHash = (sourceUrl: string): string =>
  createHash("sha256").update(sourceUrl).digest("hex").slice(0, HASH_PREFIX_LENGTH);

const isR2Configured = (): boolean =>
  Boolean(
    env.CLOUDFLARE_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_PUBLIC_BASE_URL,
  );

async function fetchAndUpload(
  prospectId: string,
  sourceUrl: string,
): Promise<string | undefined> {
  try {
    const fetched = await fetchImageBytes(sourceUrl);
    if (!fetched) return undefined;

    // Measured on the SOURCE bytes, deliberately: this is a placeholder
    // detector, and after a resize a real photo could fall under the threshold.
    if (fetched.bytes.byteLength < MIN_SOURCE_BYTES) return undefined;

    const prepared = await prepareImage(fetched.bytes, fetched.contentType);
    if (!prepared) return undefined;

    return await r2PutBuffer(
      r2BuildKey(
        "pregen",
        prospectId,
        `${rehostedSourceHash(sourceUrl)}.${prepared.ext}`,
      ),
      prepared.buffer,
      prepared.contentType,
    );
  } catch {
    return undefined;
  }
}

async function fetchImageBytes(
  sourceUrl: string,
): Promise<{ bytes: Buffer; contentType: string } | undefined> {
  const res = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      // Some hosts serve a 403 to a default fetch UA but the real bytes to a
      // browser one. Nothing here depends on the answer being HTML.
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });
  if (!res.ok) return undefined;

  const contentType =
    res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) return undefined;

  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return undefined;

  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) return undefined;

  return { bytes, contentType };
}

type PreparedImage = { buffer: Buffer; contentType: string; ext: string };

/**
 * Resize down to MAX_EDGE and re-encode. Returns `undefined` only when the
 * image must not be published at all.
 */
async function prepareImage(
  buffer: Buffer,
  sourceContentType: string,
): Promise<PreparedImage | undefined> {
  const asIs: PreparedImage = {
    buffer,
    contentType: sourceContentType,
    ext: extensionFor(sourceContentType),
  };

  // Read the header WITHOUT the pixel limit: sharp enforces limitInputPixels on
  // metadata() too, so a limited read throws before the dimensions can be
  // inspected and the oversized original would sail through the catch. A header
  // parse decodes no pixels, so an unlimited read is safe at any declared size.
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    // Exotic format or corrupt header. The bytes are still whatever the source
    // served the browser, so publish them.
    return asIs;
  }
  if (!metadata.width || !metadata.height) return asIs;

  // Never publish an image we refuse to decode: hosting it would hand a
  // decompression-bomb-sized asset to the prospect's browser.
  if (metadata.width * metadata.height > MAX_INPUT_PIXELS) return undefined;

  // sharp reports AVIF, HEIC and HEIF all as `heif`. None of them can be
  // published under a `.jpg` name, so they must be re-encoded or skipped.
  const isHeifFamily = metadata.format === "heif";
  const needsResize = Math.max(metadata.width, metadata.height) > MAX_EDGE;
  if (!needsResize && !isHeifFamily) return asIs;

  try {
    const preserveAlpha = metadata.hasAlpha === true;
    let pipeline = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS });
    if (needsResize) {
      pipeline = pipeline.resize(MAX_EDGE, MAX_EDGE, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    const encoded = await (
      preserveAlpha ? pipeline.png() : pipeline.jpeg({ quality: 85 })
    ).toBuffer();

    return preserveAlpha
      ? { buffer: encoded, contentType: "image/png", ext: "png" }
      : { buffer: encoded, contentType: "image/jpeg", ext: "jpg" };
  } catch {
    // A HEIF-family image sharp cannot decode is unpublishable. Any other
    // decode failure is a corrupt stream inside the size cap, whose original
    // bytes still render.
    return isHeifFamily ? undefined : asIs;
  }
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const extensionFor = (contentType: string): string =>
  EXTENSIONS[contentType] ?? "jpg";

const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};
