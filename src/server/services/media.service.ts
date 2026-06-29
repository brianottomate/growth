import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "../db";
import type { MediaKind } from "../db/schema";
import { mediaAssetTable } from "../db/schema";
import { createId } from "../db/utils";
import { R2 } from "../clients/r2.client";
import { Stream } from "../clients/stream.client";

// Image vs video routing by mime type.
export const MEDIA_MIME = {
  image: ["image/jpeg", "image/png", "image/webp", "image/avif"],
  gif: ["image/gif"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
} as const;

export function kindForMime(mimeType: string): MediaKind {
  if ((MEDIA_MIME.gif as readonly string[]).includes(mimeType)) return "gif";
  if ((MEDIA_MIME.image as readonly string[]).includes(mimeType)) return "image";
  if ((MEDIA_MIME.video as readonly string[]).includes(mimeType)) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

export function isVideoMime(mimeType: string): boolean {
  return (MEDIA_MIME.video as readonly string[]).includes(mimeType);
}

/**
 * Begin an R2 (image/gif/file) upload. Creates a pending row and returns a
 * presigned PUT URL for the browser to upload to directly.
 */
export async function createR2Upload(input: {
  brandId: string;
  uploadedBy: string;
  filename: string;
  mimeType: string;
  size: number;
}) {
  const kind = kindForMime(input.mimeType);
  const [asset] = await db
    .insert(mediaAssetTable)
    .values({
      brandId: input.brandId,
      uploadedBy: input.uploadedBy,
      provider: "r2",
      kind,
      status: "uploading",
      filename: input.filename,
      mimeType: input.mimeType,
      size: input.size,
    })
    .returning();
  if (!asset) throw new Error("Failed to create media row");

  const key = R2.buildKey(input.brandId, asset.id, input.filename);
  const publicUrl = R2.publicUrl(key);

  await db
    .update(mediaAssetTable)
    .set({ r2Key: key, url: publicUrl })
    .where(eq(mediaAssetTable.id, asset.id));

  const uploadUrl = await R2.presignPut(key, input.mimeType);
  return { mediaId: asset.id, uploadUrl, publicUrl, key };
}

/** Infer the source provider from an external URL's host (for icon/handling). */
export function sourceProviderForUrl(url: string): string {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (host.includes("google.com") || host.includes("googleusercontent.com"))
    return "google_drive";
  if (host.includes("dropbox.com")) return "dropbox";
  if (host.includes("frame.io")) return "frameio";
  return "other";
}

/**
 * Register an external (linked) asset — a file we reference but never host
 * (Google Drive / Dropbox / Frame.io master, etc.). No bytes touch our infra,
 * so the row is born `ready`.
 */
export async function createExternal(input: {
  brandId: string;
  uploadedBy: string;
  externalUrl: string;
  kind?: MediaKind;
  title?: string;
  sourceProvider?: string;
}) {
  const [asset] = await db
    .insert(mediaAssetTable)
    .values({
      brandId: input.brandId,
      uploadedBy: input.uploadedBy,
      provider: "external",
      kind: input.kind ?? "file",
      status: "ready",
      title: input.title,
      externalUrl: input.externalUrl,
      url: input.externalUrl, // mirror so existing "open" affordances work
      sourceProvider: input.sourceProvider ?? sourceProviderForUrl(input.externalUrl),
    })
    .returning();
  if (!asset) throw new Error("Failed to create external media row");
  return asset;
}

/** Mark an R2 upload complete (called by the browser after the PUT succeeds). */
export async function finalizeR2Upload(input: {
  mediaId: string;
  width?: number;
  height?: number;
}) {
  const [updated] = await db
    .update(mediaAssetTable)
    .set({
      status: "ready",
      width: input.width ?? null,
      height: input.height ?? null,
    })
    .where(eq(mediaAssetTable.id, input.mediaId))
    .returning();
  return updated ?? null;
}

/**
 * Begin a Cloudflare Stream (video) upload. Creates a pending row carrying the
 * Stream uid and returns the one-time upload URL for the browser.
 */
export async function createVideoUpload(input: {
  brandId: string;
  uploadedBy: string;
  filename: string;
}) {
  const { uploadURL, uid } = await Stream.createDirectUpload({
    name: input.filename,
    creator: input.uploadedBy,
  });

  const [asset] = await db
    .insert(mediaAssetTable)
    .values({
      brandId: input.brandId,
      uploadedBy: input.uploadedBy,
      provider: "stream",
      kind: "video",
      status: "processing",
      filename: input.filename,
      streamUid: uid,
    })
    .returning();
  if (!asset) throw new Error("Failed to create media row");

  return { mediaId: asset.id, uploadUrl: uploadURL, uid };
}

/** Flip a Stream asset to ready and backfill metadata (webhook or poll). */
export async function markVideoReady(
  uid: string,
  meta: {
    duration?: number;
    thumbnailUrl?: string;
    width?: number;
    height?: number;
  },
) {
  const [updated] = await db
    .update(mediaAssetTable)
    .set({
      status: "ready",
      duration: meta.duration ?? null,
      thumbnailUrl: meta.thumbnailUrl ?? null,
      width: meta.width ?? null,
      height: meta.height ?? null,
    })
    .where(eq(mediaAssetTable.streamUid, uid))
    .returning();
  return updated ?? null;
}

/** Poll Stream for a processing asset and persist the latest state. */
export async function syncVideo(mediaId: string) {
  const asset = await db.query.mediaAssetTable.findFirst({
    where: eq(mediaAssetTable.id, mediaId),
  });
  if (!asset?.streamUid) return asset ?? null;
  if (asset.status === "ready") return asset;

  const video = await Stream.getVideo(asset.streamUid);
  if (!video.readyToStream) return asset;

  return markVideoReady(asset.streamUid, {
    duration: Math.round(video.duration),
    thumbnailUrl: video.thumbnail,
    width: video.input?.width,
    height: video.input?.height,
  });
}

export async function listMedia(input: {
  brandId: string;
  kind?: MediaKind;
}) {
  return db.query.mediaAssetTable.findMany({
    where: and(
      eq(mediaAssetTable.brandId, input.brandId),
      input.kind ? eq(mediaAssetTable.kind, input.kind) : undefined,
      isNull(mediaAssetTable.deletedAt),
    ),
    orderBy: [desc(mediaAssetTable.createdAt)],
  });
}

export async function getMedia(id: string) {
  return db.query.mediaAssetTable.findFirst({
    where: and(eq(mediaAssetTable.id, id), isNull(mediaAssetTable.deletedAt)),
  });
}

export async function updateMediaMeta(input: {
  id: string;
  title?: string;
  alt?: string;
  tags?: string[];
}) {
  const [updated] = await db
    .update(mediaAssetTable)
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.alt !== undefined && { alt: input.alt }),
      ...(input.tags !== undefined && { tags: input.tags }),
    })
    .where(eq(mediaAssetTable.id, input.id))
    .returning();
  return updated ?? null;
}

/**
 * Edit an external (linked) asset — title, URL, kind, and/or thumbnail. A
 * thumbnail can arrive as pasted/uploaded bytes (base64) or a URL we fetch +
 * rehost server-side; either way it lands on R2 as the asset's poster. Pass
 * `thumbnailUrl: null` (with no `thumbnail`) to clear it.
 */
export async function updateExternal(input: {
  id: string;
  brandId: string;
  title?: string;
  externalUrl?: string;
  kind?: MediaKind;
  thumbnail?: { base64Data: string; mimeType: string; filename: string };
  thumbnailUrl?: string | null;
}) {
  let thumbnailUrl: string | null | undefined;
  if (input.thumbnail) {
    const buffer = Buffer.from(input.thumbnail.base64Data, "base64");
    const ext = (input.thumbnail.mimeType.split("/")[1] ?? "jpg").replace(
      /[^a-z0-9]/gi,
      "",
    );
    const key = R2.buildPosterKey(input.brandId, input.id, ext || "jpg");
    thumbnailUrl = await R2.putBuffer(key, buffer, input.thumbnail.mimeType);
  } else if (input.thumbnailUrl) {
    const key = R2.buildPosterKey(input.brandId, input.id);
    thumbnailUrl = await R2.putFromUrl(key, input.thumbnailUrl);
  } else if (input.thumbnailUrl === null) {
    thumbnailUrl = null;
  }

  const [updated] = await db
    .update(mediaAssetTable)
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.externalUrl !== undefined && {
        externalUrl: input.externalUrl,
        url: input.externalUrl, // mirror so "open" affordances keep working
        sourceProvider: sourceProviderForUrl(input.externalUrl),
      }),
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(thumbnailUrl !== undefined && { thumbnailUrl }),
    })
    .where(eq(mediaAssetTable.id, input.id))
    .returning();
  return updated ?? null;
}

/** Soft-delete the row and best-effort-delete the underlying bytes. */
export async function deleteMedia(id: string) {
  const asset = await getMedia(id);
  if (!asset) return { id };

  await db
    .update(mediaAssetTable)
    .set({ deletedAt: new Date() })
    .where(eq(mediaAssetTable.id, id));

  if (asset.provider === "r2" && asset.r2Key) {
    R2.delete(asset.r2Key).catch((e) =>
      console.error(`⚠️ R2 delete failed for ${asset.r2Key}:`, e),
    );
  } else if (asset.provider === "stream" && asset.streamUid) {
    Stream.deleteVideo(asset.streamUid).catch((e) =>
      console.error(`⚠️ Stream delete failed for ${asset.streamUid}:`, e),
    );
  }
  return { id };
}

/**
 * Upload a transient chat attachment (a pasted/dropped image) to R2 and return
 * its public URL. Deliberately NOT a media_asset row — it's an ephemeral blob
 * the /overview chat composer attaches to a message as an AI SDK file part.
 * Mirrors Homi's `uploadScreenshot`, on growth's R2 (1-shot, base64 in).
 */
export async function uploadChatImage(input: {
  dataUrl: string;
  userId: string;
  fileName?: string;
}): Promise<{ url: string; mediaType: string }> {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(input.dataUrl);
  if (!match) throw new Error("Expected a base64-encoded image data URL");
  const mediaType = match[1]!;
  if (!mediaType.startsWith("image/")) {
    throw new Error("Only images can be attached");
  }
  const buffer = Buffer.from(match[2]!, "base64");
  const MAX_BYTES = 10 * 1024 * 1024; // 10MB — plenty for a screenshot/photo
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error("Image is too large (max 10MB)");
  }
  const ext = (mediaType.split("/")[1] ?? "png").split("+")[0];
  const safeName = input.fileName?.trim().replace(/[^a-zA-Z0-9_.-]/g, "-");
  // Unique key per upload so same-named pastes never collide; scoped per user.
  const filename = `${createId("att")}-${safeName || `paste.${ext}`}`;
  const key = R2.buildUploadKey("chat", input.userId, filename);
  const url = await R2.putBuffer(key, buffer, mediaType);
  return { url, mediaType };
}

export const MediaService = {
  createR2Upload,
  finalizeR2Upload,
  createVideoUpload,
  markVideoReady,
  syncVideo,
  createExternal,
  updateExternal,
  list: listMedia,
  get: getMedia,
  updateMeta: updateMediaMeta,
  delete: deleteMedia,
  kindForMime,
  isVideoMime,
  uploadChatImage,
} as const;
