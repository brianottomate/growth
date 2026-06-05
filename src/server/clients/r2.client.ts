import {
  DeleteObjectCommand,
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
    throw new Error("R2 credentials (R2_ACCESS_KEY_ID/SECRET) are not configured");
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

/** Public URL for an object key (bucket root is mapped to R2_PUBLIC_BASE_URL). */
export function r2PublicUrl(key: string): string {
  if (!env.R2_PUBLIC_BASE_URL) {
    throw new Error("R2_PUBLIC_BASE_URL is not configured (enable public access on the bucket)");
  }
  return `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
}

/**
 * Build the object key, scoped by brand + media id. R2_PREFIX is optional — set
 * it only when sharing a bucket with other data (e.g. "growth/"); for a
 * dedicated bucket leave it empty and keys are just `{brandId}/{mediaId}/{file}`.
 */
export function r2BuildKey(brandId: string, mediaId: string, filename: string): string {
  const safe = filename
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return [env.R2_PREFIX, brandId, mediaId, safe || "file"]
    .filter(Boolean)
    .join("/");
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

// ---- POSTER RE-HOSTING --------------------------------------------
// Some platforms hand us media URLs we can't serve long-term: TikTok posters
// are signed and expire within ~a day; Facebook's fbcdn blocks hotlinking
// outright. We copy those into R2 (under a dedicated `posters/` folder) so feed
// thumbnails keep working. Mirrors displayPoster's BLOCKED_HOSTS.
const REHOST_HOST_PATTERNS = ["fbcdn.net", "tiktokcdn"];

/** True if a media URL is on an expiring/blocked host and should be re-hosted. */
export function needsRehost(url: string): boolean {
  try {
    return REHOST_HOST_PATTERNS.some((p) => new URL(url).hostname.includes(p));
  } catch {
    return false;
  }
}

/** Object key for a re-hosted poster, under `{R2_PREFIX}posters/{brandId}/`. */
export function r2BuildPosterKey(brandId: string, id: string, ext = "jpg"): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "-");
  return [env.R2_PREFIX, "posters", brandId, `${safeId}.${ext}`]
    .filter(Boolean)
    .join("/");
}

/** Server-side: fetch bytes from a URL and PUT them to R2; returns public URL. */
export async function r2PutFromUrl(key: string, sourceUrl: string): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`r2PutFromUrl: fetch ${sourceUrl} → ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: res.headers.get("content-type") ?? "image/jpeg",
    }),
  );
  return r2PublicUrl(key);
}

export const R2 = {
  publicUrl: r2PublicUrl,
  buildKey: r2BuildKey,
  buildPosterKey: r2BuildPosterKey,
  presignPut: r2PresignPut,
  putFromUrl: r2PutFromUrl,
  needsRehost,
  delete: r2Delete,
} as const;
