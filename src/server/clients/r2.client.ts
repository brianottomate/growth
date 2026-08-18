import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/env";

// Cloudflare R2 over its S3-compatible API. We presign PUT URLs so the browser
// uploads bytes straight to R2 (no Vercel function in the byte path), then read
// the object back via the public domain (R2_PUBLIC_BASE_URL → bucket root).

function getEndpoint(): string {
  if (!env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is not configured");
  }
  return `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

let _client: S3Client | null = null;
function getClient(): S3Client {
  if (_client) return _client;
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error(
      "R2 credentials (R2_ACCESS_KEY_ID/SECRET) are not configured",
    );
  }
  _client = new S3Client({
    region: "auto",
    endpoint: getEndpoint(),
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  return _client;
}

/** True when a URL points at our public R2 bucket (i.e. bytes we host). */
export function r2IsPublicUrl(url: string): boolean {
  if (!env.R2_PUBLIC_BASE_URL) return false;
  try {
    const base = new URL(env.R2_PUBLIC_BASE_URL);
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === base.hostname;
  } catch {
    return false;
  }
}

/** Public URL for an object key (bucket root is mapped to R2_PUBLIC_BASE_URL). */
export function r2PublicUrl(key: string): string {
  if (!env.R2_PUBLIC_BASE_URL) {
    throw new Error(
      "R2_PUBLIC_BASE_URL is not configured (enable public access on the bucket)",
    );
  }
  return `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
}

/**
 * Build the object key, scoped by brand + media id. R2_PREFIX is optional — set
 * it only when sharing a bucket with other data (e.g. "growth/"); for a
 * dedicated bucket leave it empty and keys are just `{brandId}/{mediaId}/{file}`.
 */
export function r2BuildKey(
  brandId: string,
  mediaId: string,
  filename: string,
): string {
  const safe = filename
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return [env.R2_PREFIX, brandId, mediaId, safe || "file"]
    .filter(Boolean)
    .join("/");
}

/**
 * Key for the downscaled tile that accompanies an uploaded image. Derived from
 * the original's key so the server never has to trust a client-supplied
 * thumbnail URL — it can always recompute the one legal value.
 */
export function r2BuildThumbnailKey(
  originalKey: string,
  extension = "webp",
): string {
  return `${originalKey}.thumb.${extension}`;
}

/** Presign a PUT for direct browser upload. URL expires in `expiresIn` seconds. */
export async function r2PresignPut(
  key: string,
  contentType: string,
  expiresIn = 600,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getClient(), command, { expiresIn });
}

/** Delete an object from R2 (best-effort cleanup on asset delete). */
export async function r2Delete(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
  );
}

/** Verify a direct upload exists before a caller finalizes its media row. */
export async function r2Head(
  key: string,
): Promise<{ size: number | null; contentType: string | null }> {
  const result = await getClient().send(
    new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
  );
  return {
    size: result.ContentLength ?? null,
    contentType: result.ContentType ?? null,
  };
}

// ---- POSTER RE-HOSTING --------------------------------------------
// Some platforms hand us media URLs we can't serve long-term: TikTok posters
// are signed and expire within ~a day; Facebook's fbcdn blocks hotlinking
// outright; Instagram's scontent.cdninstagram.com URLs are signed and expire
// within ~weeks (the main source of broken feed thumbnails). We copy those into
// R2 (under a dedicated `posters/` folder) so feed thumbnails keep working.
const REHOST_HOST_PATTERNS = ["fbcdn.net", "tiktokcdn", "cdninstagram"];

/** True if a media URL is on an expiring/blocked host and should be re-hosted. */
export function needsRehost(url: string): boolean {
  try {
    return REHOST_HOST_PATTERNS.some((p) => new URL(url).hostname.includes(p));
  } catch {
    return false;
  }
}

/** Object key for a re-hosted poster, under `{R2_PREFIX}posters/{brandId}/`. */
export function r2BuildPosterKey(
  brandId: string,
  id: string,
  ext = "jpg",
): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "-");
  return [env.R2_PREFIX, "posters", brandId, `${safeId}.${ext}`]
    .filter(Boolean)
    .join("/");
}

/**
 * Object key for a re-hosted post video, under `{R2_PREFIX}post-media/{brandId}/`.
 * Separate from `posters/`: a poster is a thumbnail we can regenerate from the
 * provider, a video is the only copy once Instagram's signed URL expires.
 */
export function r2BuildPostVideoKey(
  brandId: string,
  id: string,
  ext = "mp4",
): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "-");
  return [env.R2_PREFIX, "post-media", brandId, `${safeId}.${ext}`]
    .filter(Boolean)
    .join("/");
}

/**
 * Key prefix for one video-analysis run's derived storyboard boards, under
 * `{R2_PREFIX}analysis/{organizationId}/{analysisId}/`. Boards are derived
 * artifacts — deliberately outside the media-library key space.
 */
export function r2AnalysisKeyPrefix(
  organizationId: string,
  analysisId: string,
): string {
  const safeOrg = organizationId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const safeAnalysis = analysisId.replace(/[^a-zA-Z0-9_-]/g, "-");
  return (
    [env.R2_PREFIX, "analysis", safeOrg, safeAnalysis]
      .filter(Boolean)
      .join("/") + "/"
  );
}

/** Object key for one storyboard board image within an analysis run. */
export function r2BuildAnalysisKey(
  organizationId: string,
  analysisId: string,
  filename: string,
): string {
  const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, "-") || "board.png";
  return `${r2AnalysisKeyPrefix(organizationId, analysisId)}${safeName}`;
}

/** Key for a user's profile photo (not brand-scoped). */
export function r2BuildUserPhotoKey(userId: string, filename: string): string {
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, "-");
  return [env.R2_PREFIX, "avatars", safeId, safeName || "avatar"]
    .filter(Boolean)
    .join("/");
}

/**
 * Key for a generic (non-brand) image upload — org logos, profile images, and
 * the shared ImageUpload component. `scope` groups by surface (e.g.
 * "organization", "user"), `id` is the owning record id for traceability.
 */
export function r2BuildUploadKey(
  scope: string,
  id: string,
  filename: string,
): string {
  const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, "-") || "general";
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "-") || "misc";
  const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, "-");
  return [env.R2_PREFIX, "uploads", safeScope, safeId, safeName || "file"]
    .filter(Boolean)
    .join("/");
}

/** Server-side: PUT an in-memory buffer to R2; returns the public URL. */
export async function r2PutBuffer(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType || "image/jpeg",
    }),
  );
  return r2PublicUrl(key);
}

/**
 * Server-side: fetch bytes from a URL and PUT them to R2; returns public URL.
 *
 * The whole body lands in memory, so `maxBytes` exists for callers copying
 * video: a reel is a few MB but nothing in the provider payload promises that,
 * and a serverless function that buffers an unbounded download dies with no
 * useful error. Refuse it early instead, off Content-Length where we get one.
 */
export async function r2PutFromUrl(
  key: string,
  sourceUrl: string,
  options: { fallbackContentType?: string; maxBytes?: number } = {},
): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok)
    throw new Error(`r2PutFromUrl: fetch ${sourceUrl} → ${res.status}`);
  const declared = Number(res.headers.get("content-length"));
  if (
    options.maxBytes &&
    Number.isFinite(declared) &&
    declared > options.maxBytes
  ) {
    throw new Error(
      `r2PutFromUrl: ${sourceUrl} is ${Math.round(declared / 1_000_000)}MB, over the ${Math.round(options.maxBytes / 1_000_000)}MB limit`,
    );
  }
  const body = Buffer.from(await res.arrayBuffer());
  if (options.maxBytes && body.byteLength > options.maxBytes) {
    throw new Error(
      `r2PutFromUrl: ${sourceUrl} downloaded ${Math.round(body.byteLength / 1_000_000)}MB, over the ${Math.round(options.maxBytes / 1_000_000)}MB limit`,
    );
  }
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType:
        res.headers.get("content-type") ??
        options.fallbackContentType ??
        "image/jpeg",
    }),
  );
  return r2PublicUrl(key);
}

export const R2 = {
  publicUrl: r2PublicUrl,
  isPublicUrl: r2IsPublicUrl,
  buildKey: r2BuildKey,
  buildThumbnailKey: r2BuildThumbnailKey,
  analysisKeyPrefix: r2AnalysisKeyPrefix,
  buildAnalysisKey: r2BuildAnalysisKey,
  buildPosterKey: r2BuildPosterKey,
  buildPostVideoKey: r2BuildPostVideoKey,
  buildUserPhotoKey: r2BuildUserPhotoKey,
  buildUploadKey: r2BuildUploadKey,
  presignPut: r2PresignPut,
  head: r2Head,
  putBuffer: r2PutBuffer,
  putFromUrl: r2PutFromUrl,
  needsRehost,
  delete: r2Delete,
} as const;
