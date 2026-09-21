import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db, withTransaction } from "../db";
import type { MediaKind, MediaStoryboard } from "../db/schema";
import {
  mediaAssetTable,
  mediaAssetTagTable,
  platformPostTable,
} from "../db/schema";
import { createId } from "../db/utils";
import { R2 } from "../clients/r2.client";
import { Stream } from "../clients/stream.client";
import {
  chatAttachmentLimitLabel,
  isChatAttachmentMediaType,
  isOwnedChatAttachmentUrl,
  maxChatAttachmentBytes,
} from "@/lib/chat-attachment";
import { MEDIA_MIME } from "@/lib/media-accept";
import { classifyFetchUrl } from "@/server/ai/url-safety";
import {
  MAX_STORYBOARD_BOARDS,
  MAX_STORYBOARD_DURATION_MS,
} from "@/lib/storyboard-limits";

/** Re-exported: the accepted-type table lives in `@/lib/media-accept`. */
export { MEDIA_MIME };

function safeFilename(filename: string, fallback = "file"): string {
  return (
    filename
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || fallback
  );
}

const MAX_IMPORTED_IMAGE_BYTES = 25 * 1024 * 1024;
/** Format the browser encodes downscaled tiles as. */
const THUMBNAIL_MIME = "image/webp";
/** Boards are PNG so the frame-number labels stay legible to the model. */
const STORYBOARD_BOARD_MIME = "image/png";

/**
 * What the browser reports after cutting a storyboard: geometry and frame map,
 * never URLs. The server derives every board URL from the video's key, exactly
 * as `finalizeR2Upload` derives the thumbnail, so a client cannot point an
 * asset at boards it did not make.
 */
const storyboardDescriptorShape = z.object({
  durationMs: z.number().int().positive().max(MAX_STORYBOARD_DURATION_MS),
  sampleIntervalMs: z.number().int().positive().max(60_000),
  gridSize: z.number().int().min(2).max(5),
  boards: z
    .array(
      z.object({
        index: z
          .number()
          .int()
          .min(0)
          .max(MAX_STORYBOARD_BOARDS - 1),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        firstFrame: z.number().int().positive(),
        lastFrame: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(MAX_STORYBOARD_BOARDS),
  frames: z
    .array(
      z.object({
        index: z.number().int().positive(),
        timestampMs: z.number().int().min(0),
        boardIndex: z.number().int().min(0),
        row: z.number().int().min(0),
        column: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(300),
});
export const storyboardDescriptorSchema = storyboardDescriptorShape
  .refine(
    (value) =>
      new Set(value.boards.map((board) => board.index)).size ===
      value.boards.length,
    { message: "Storyboard board indices must be unique." },
  )
  .refine(
    (value) => {
      const present = new Set(value.boards.map((board) => board.index));
      return value.frames.every((frame) => present.has(frame.boardIndex));
    },
    { message: "Every storyboard frame must sit on an included board." },
  );
export type StoryboardDescriptor = z.infer<typeof storyboardDescriptorSchema>;

function storyboardFromDescriptor(
  videoKey: string,
  descriptor: StoryboardDescriptor,
): MediaStoryboard {
  return {
    durationMs: descriptor.durationMs,
    sampleIntervalMs: descriptor.sampleIntervalMs,
    gridSize: descriptor.gridSize,
    frames: descriptor.frames,
    boards: descriptor.boards.map((board) => {
      const pathname = R2.buildStoryboardKey(videoKey, board.index);
      return { ...board, pathname, url: R2.publicUrl(pathname) };
    }),
  };
}

/**
 * Whole seconds, the unit `media_asset.duration` has always used. Null at the
 * renderer's clamp: a longer clip is sampled only to that point, and recording
 * the clamp as its length would be a lie.
 */
function durationSeconds(durationMs: number): number | null {
  if (durationMs >= MAX_STORYBOARD_DURATION_MS) return null;
  return Math.max(1, Math.round(durationMs / 1_000));
}

/** The column values a storyboard settles: itself, and the length if known. */
function storyboardColumns(storyboard: MediaStoryboard) {
  const duration = durationSeconds(storyboard.durationMs);
  return { storyboard, ...(duration ? { duration } : {}) };
}
/**
 * Image types any import path will store — direct upload, remote URL, or a
 * connector. Derived from MEDIA_MIME so there is one list, not three.
 */
const IMPORTABLE_IMAGE_TYPES: readonly string[] = [
  ...MEDIA_MIME.image,
  ...MEDIA_MIME.gif,
];

export async function fetchPublicImage(rawUrl: string): Promise<{
  body: Buffer;
  contentType: string;
  finalUrl: string;
}> {
  let current = rawUrl;
  for (let redirects = 0; redirects <= 4; redirects++) {
    const classified = classifyFetchUrl(current);
    if (!classified.ok || !classified.url) {
      throw new Error(classified.reason ?? "Image URL is not safe to fetch.");
    }
    const response = await fetch(classified.url, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "wander-growth-media-import/1.0" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 4) {
        throw new Error("Image URL redirected too many times.");
      }
      current = new URL(location, classified.url).toString();
      continue;
    }
    if (!response.ok) {
      throw new Error(`Image download failed (${response.status}).`);
    }
    const contentType =
      response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ?? "";
    if (!IMPORTABLE_IMAGE_TYPES.includes(contentType)) {
      throw new Error(`Remote file is not a supported image (${contentType}).`);
    }
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (declaredSize > MAX_IMPORTED_IMAGE_BYTES) {
      throw new Error("Remote image exceeds 25 MB.");
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength > MAX_IMPORTED_IMAGE_BYTES) {
      throw new Error("Remote image exceeds 25 MB.");
    }
    return { body, contentType, finalUrl: classified.url };
  }
  throw new Error("Image URL could not be fetched.");
}

function extensionForImageMime(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/svg+xml") return "svg";
  return mimeType.split("/")[1] ?? "png";
}

export function kindForMime(mimeType: string): MediaKind {
  if ((MEDIA_MIME.gif as readonly string[]).includes(mimeType)) return "gif";
  if ((MEDIA_MIME.image as readonly string[]).includes(mimeType))
    return "image";
  if ((MEDIA_MIME.video as readonly string[]).includes(mimeType))
    return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

/**
 * Begin a direct browser → R2 upload. Reserves the media row in `uploading`
 * state and returns a presigned PUT URL plus the deterministic key/public URL.
 */
export async function createR2Upload(input: {
  brandId: string;
  uploadedBy: string;
  filename: string;
  mimeType: string;
  size: number;
  /** Storyboard boards the browser has already cut for a video. */
  boardCount?: number;
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

  // Images and video both get a presigned slot for a browser-generated tile.
  // The grid renders that instead of a multi-megabyte original; callers that
  // skip it just leave `thumbnailUrl` null. Video has no sane fallback at all
  // (an <img> pointed at a .mov is a blank square), so its poster matters more
  // than the image one does.
  const thumbnail =
    kind === "image" || kind === "video"
      ? await (async () => {
          const thumbnailKey = R2.buildThumbnailKey(key);
          return {
            thumbnailUploadUrl: await R2.presignPut(
              thumbnailKey,
              THUMBNAIL_MIME,
            ),
            thumbnailPathname: thumbnailKey,
            thumbnailPublicUrl: R2.publicUrl(thumbnailKey),
          };
        })()
      : null;

  const boardCount =
    kind === "video"
      ? Math.min(MAX_STORYBOARD_BOARDS, Math.max(0, input.boardCount ?? 0))
      : 0;
  const boardUploads = await Promise.all(
    Array.from({ length: boardCount }, async (_, index) => {
      const boardKey = R2.buildStoryboardKey(key, index);
      return {
        index,
        uploadUrl: await R2.presignPut(boardKey, STORYBOARD_BOARD_MIME),
      };
    }),
  );

  return {
    mediaId: asset.id,
    uploadUrl,
    publicUrl,
    pathname: key,
    ...(thumbnail ?? {}),
    boardUploads,
  };
}

/** Mark an R2 upload complete (called by the browser after the PUT succeeds). */
export async function finalizeR2Upload(input: {
  mediaId: string;
  url: string;
  pathname: string;
  width?: number;
  height?: number;
  /** The browser PUT a downscaled tile to the presigned thumbnail slot. */
  hasThumbnail?: boolean;
  /** The browser PUT these boards to the presigned board slots. */
  storyboard?: StoryboardDescriptor;
}) {
  const asset = await getMedia(input.mediaId);
  if (asset?.provider !== "r2") return null;
  if (asset.r2Key !== input.pathname || asset.url !== input.url) {
    throw new Error("Upload does not match the media asset");
  }

  // Derived, never client-supplied — the only keys the presigns could have
  // been issued for.
  const thumbnailUrl = input.hasThumbnail
    ? R2.publicUrl(R2.buildThumbnailKey(asset.r2Key))
    : null;
  const storyboard =
    input.storyboard && asset.kind === "video"
      ? storyboardFromDescriptor(asset.r2Key, input.storyboard)
      : null;

  const [updated] = await db
    .update(mediaAssetTable)
    .set({
      status: "ready",
      // Guarded like `thumbnailUrl`: finalize has no status precondition, so a
      // second call without dimensions would null the ones already measured.
      ...(input.width ? { width: input.width } : {}),
      ...(input.height ? { height: input.height } : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      ...(storyboard ? storyboardColumns(storyboard) : {}),
    })
    .where(eq(mediaAssetTable.id, input.mediaId))
    .returning();
  return updated ?? null;
}

/**
 * Mark an upload that never delivered its bytes.
 *
 * A failed or hung PUT used to leave the row on `uploading` forever: it shows
 * in the library as a broken tile, and nothing ever cleans it up because the
 * only writer is the finalize call that never came. Only moves rows still
 * waiting, so a late-but-successful finalize is never overwritten.
 */
/** How long an unfinalised upload stays visible before it reads as dead. */
const STALE_UPLOAD_MINUTES = 15;

export async function failR2Upload(mediaId: string, reason?: string) {
  const existing = await getMedia(mediaId);
  const [updated] = await db
    .update(mediaAssetTable)
    .set({
      status: "error",
      // Into metadata, never `alt`. Alt text is copy: it is searched, rendered
      // as the tile's alt attribute, and used as the asset's display name
      // wherever there is no title — so an upload error written there became
      // the asset's name and a search hit for "failed".
      metadata: {
        ...(existing?.metadata as Record<string, unknown> | null),
        ...(reason ? { uploadError: reason.slice(0, 500) } : {}),
      },
    })
    .where(
      and(
        eq(mediaAssetTable.id, mediaId),
        eq(mediaAssetTable.status, "uploading"),
      ),
    )
    .returning({ id: mediaAssetTable.id });
  return updated ?? null;
}

export async function verifyR2Upload(mediaId: string) {
  const asset = await getMedia(mediaId);
  if (
    asset?.provider !== "r2" ||
    !asset.r2Key ||
    !asset.url ||
    (asset.status !== "uploading" && asset.status !== "ready")
  ) {
    throw new Error("Media upload is not available to finalize.");
  }
  const object = await R2.head(asset.r2Key);
  if (object.size === 0) throw new Error("Uploaded image is empty.");
  if (object.size && object.size > MAX_IMPORTED_IMAGE_BYTES) {
    throw new Error("Uploaded image exceeds 25 MB.");
  }
  if (object.contentType && !object.contentType.startsWith("image/")) {
    throw new Error("Uploaded object is not an image.");
  }
  return asset;
}

/**
 * Store already-downloaded image bytes as a library asset.
 *
 * Split out of `importRemoteImage` so sources that need their own auth to
 * fetch (a connector, say) reuse the exact same R2 key layout, row shape and
 * provenance handling instead of growing a parallel path.
 */
export async function importImageBuffer(input: {
  brandId: string;
  uploadedBy: string;
  body: Buffer;
  contentType: string;
  filename: string;
  title?: string;
  alt?: string;
  width?: number;
  height?: number;
  /** Optional pre-made tile; stored beside the original like browser uploads. */
  thumbnail?: { body: Buffer; contentType: string };
  externalUrl?: string;
  sourceProvider?: string;
  metadata?: Record<string, unknown>;
}) {
  if (!IMPORTABLE_IMAGE_TYPES.includes(input.contentType)) {
    throw new Error(`Unsupported image type (${input.contentType}).`);
  }
  if (input.body.byteLength > MAX_IMPORTED_IMAGE_BYTES) {
    throw new Error("Imported image exceeds 25 MB.");
  }

  const id = createId("media");
  const filename = safeFilename(
    input.filename,
    `image.${extensionForImageMime(input.contentType)}`,
  );
  const key = R2.buildKey(input.brandId, id, filename);
  const url = await R2.putBuffer(key, input.body, input.contentType);

  let thumbnailUrl: string | null = null;
  if (input.thumbnail) {
    // Callers differ on encoding (browser uploads are WebP, some connectors
    // hand back JPEG) — name the object after what's actually in it.
    const thumbnailKey = R2.buildThumbnailKey(
      key,
      extensionForImageMime(input.thumbnail.contentType),
    );
    thumbnailUrl = await R2.putBuffer(
      thumbnailKey,
      input.thumbnail.body,
      input.thumbnail.contentType,
    );
  }

  const [asset] = await db
    .insert(mediaAssetTable)
    .values({
      id,
      brandId: input.brandId,
      uploadedBy: input.uploadedBy,
      provider: "r2",
      kind: input.contentType === "image/gif" ? "gif" : "image",
      status: "ready",
      title: input.title?.trim() || null,
      alt: input.alt?.trim() || null,
      filename,
      mimeType: input.contentType,
      size: input.body.byteLength,
      width: input.width ?? null,
      height: input.height ?? null,
      r2Key: key,
      url,
      thumbnailUrl,
      externalUrl: input.externalUrl ?? null,
      sourceProvider: input.sourceProvider ?? null,
      metadata: input.metadata ?? null,
    })
    .returning();
  if (!asset) throw new Error("Could not save imported image.");
  return asset;
}

export async function importRemoteImage(input: {
  brandId: string;
  uploadedBy: string;
  url: string;
  filename?: string;
  title?: string;
  width?: number;
  height?: number;
}) {
  const downloaded = await fetchPublicImage(input.url);
  const id = createId("media");
  const fallbackName = `image.${extensionForImageMime(downloaded.contentType)}`;
  const filename = safeFilename(
    input.filename ??
      new URL(downloaded.finalUrl).pathname.split("/").pop() ??
      fallbackName,
    fallbackName,
  );
  const key = R2.buildKey(input.brandId, id, filename);
  const url = await R2.putBuffer(key, downloaded.body, downloaded.contentType);
  const [asset] = await db
    .insert(mediaAssetTable)
    .values({
      id,
      brandId: input.brandId,
      uploadedBy: input.uploadedBy,
      provider: "r2",
      kind: downloaded.contentType === "image/gif" ? "gif" : "image",
      status: "ready",
      title: input.title?.trim() || null,
      filename,
      mimeType: downloaded.contentType,
      size: downloaded.body.byteLength,
      width: input.width ?? null,
      height: input.height ?? null,
      r2Key: key,
      url,
      thumbnailUrl: url,
      metadata: {
        source: "remote_import",
        sourceUrl: input.url,
      },
    })
    .returning();
  if (!asset) throw new Error("Could not save imported image.");
  return asset;
}

/**
 * The library's copy of a remote image this brand already imported, if any.
 * `importRemoteImage` records the requested url, so the same hero shot asked
 * for twice is one asset rather than one per run.
 */
export async function findImportedImage(input: {
  brandId: string;
  url: string;
}) {
  return db.query.mediaAssetTable.findFirst({
    where: and(
      eq(mediaAssetTable.brandId, input.brandId),
      eq(mediaAssetTable.provider, "r2"),
      // importRemoteImage files a GIF under its own kind.
      inArray(mediaAssetTable.kind, ["image", "gif"]),
      eq(mediaAssetTable.status, "ready"),
      isNull(mediaAssetTable.deletedAt),
      sql`${mediaAssetTable.metadata} ->> 'sourceUrl' = ${input.url}`,
    ),
    orderBy: (asset, { desc }) => [desc(asset.createdAt)],
    columns: { id: true, url: true },
  });
}

/**
 * Flip a legacy Cloudflare Stream asset to ready and backfill metadata
 * (webhook-driven). New video uploads go to R2; this only serves rows created
 * before the R2 cutover whose transcodes finish late.
 */
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
      url: input.externalUrl,
      sourceProvider:
        input.sourceProvider ?? sourceProviderForUrl(input.externalUrl),
    })
    .returning();
  if (!asset) throw new Error("Failed to create external media row");
  return asset;
}

function extensionFor(mimeType: string, sourceUrl: string): string {
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
  };
  if (byMime[mimeType]) return byMime[mimeType];
  try {
    const ext = new URL(sourceUrl).pathname.split(".").pop()?.toLowerCase();
    if (ext && /^[a-z0-9]{2,5}$/.test(ext)) return ext;
  } catch {
    // Fall through to a neutral binary extension.
  }
  return "bin";
}

/** Download selected post media and create durable destination-brand assets. */
export async function capturePostMedia(input: {
  platformPostId: string;
  destinationBrandId: string;
  mediaIndexes: number[];
  uploadedBy: string;
}) {
  const post = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, input.platformPostId),
    with: { brand: { columns: { name: true } } },
  });
  if (!post) throw new Error("Post not found");
  const media = post.media ?? [];
  const indexes = [...new Set(input.mediaIndexes)].filter(
    (index) => index >= 0 && index < media.length,
  );
  if (!indexes.length) throw new Error("Choose at least one media item");

  const existing = await db.query.mediaAssetTable.findMany({
    where: and(
      eq(mediaAssetTable.brandId, input.destinationBrandId),
      eq(mediaAssetTable.sourcePlatformPostId, post.id),
      inArray(mediaAssetTable.sourceMediaIndex, indexes),
    ),
  });
  const byIndex = new Map(
    existing.map((asset) => [asset.sourceMediaIndex, asset]),
  );
  const assets = [];

  for (const index of indexes) {
    const prior = byIndex.get(index);
    if (prior) {
      if (prior.deletedAt) {
        const [restored] = await db
          .update(mediaAssetTable)
          .set({ deletedAt: null })
          .where(eq(mediaAssetTable.id, prior.id))
          .returning();
        if (restored) assets.push(restored);
      } else {
        assets.push(prior);
      }
      continue;
    }

    const item = media[index]!;
    // Prefer the source original, but social CDNs (especially Instagram) can
    // expire before a human chooses to capture it. Ingest keeps a durable R2
    // poster for those hosts; it gives the library action a useful, explicitly
    // user-selected fallback instead of failing the whole selection.
    let sourceUrl = item.url;
    let response = await fetch(sourceUrl);
    if (
      !response.ok &&
      item.type === "image" &&
      item.thumbnail &&
      item.thumbnail !== item.url
    ) {
      sourceUrl = item.thumbnail;
      response = await fetch(sourceUrl);
    }
    if (!response.ok) {
      throw new Error(
        `Could not download media ${index + 1} (${response.status})`,
      );
    }
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (declaredSize > 250 * 1024 * 1024) {
      throw new Error(`Media ${index + 1} is larger than 250 MB`);
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength > 250 * 1024 * 1024) {
      throw new Error(`Media ${index + 1} is larger than 250 MB`);
    }
    const mimeType =
      response.headers.get("content-type")?.split(";")[0] ??
      (item.type === "video" ? "video/mp4" : "image/jpeg");
    const id = createId("media");
    const ext = extensionFor(mimeType, sourceUrl);
    const filename = `${post.platform}-${post.externalId ?? post.id}-${index + 1}.${ext}`;
    const key = R2.buildKey(input.destinationBrandId, id, filename);
    const url = await R2.putBuffer(key, body, mimeType);
    const [asset] = await db
      .insert(mediaAssetTable)
      .values({
        id,
        brandId: input.destinationBrandId,
        uploadedBy: input.uploadedBy,
        sourcePlatformPostId: post.id,
        sourceMediaIndex: index,
        provider: "r2",
        kind: kindForMime(mimeType),
        status: "ready",
        title: `${post.brand?.name ?? "Post"} · ${post.platform} · media ${index + 1}`,
        filename,
        mimeType,
        size: body.byteLength,
        r2Key: key,
        url,
        thumbnailUrl: item.thumbnail,
        width: item.width,
        height: item.height,
        metadata: {
          source: "timeline_post",
          sourceBrandId: post.brandId,
          sourcePostExternalId: post.externalId,
          sourcePostUrl: post.externalUrl,
          originalMediaUrl: item.url,
          capturedFromUrl: sourceUrl,
          capturedAt: new Date().toISOString(),
        },
      })
      .returning();
    if (asset) assets.push(asset);
  }

  return { captured: assets.length, assets };
}

/**
 * Preserve volatile social-media previews for a timeline post without creating
 * library assets. This is deliberately on-demand: the post still points at its
 * source original, while `thumbnail` becomes a durable R2 display fallback.
 */
export async function stabilizePostMedia(platformPostId: string) {
  const post = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, platformPostId),
  });
  if (!post) throw new Error("Post not found");

  const media = post.media ?? [];
  let stabilized = 0;
  let failed = 0;
  const next = [] as typeof media;

  for (const [index, item] of media.entries()) {
    // An R2 thumbnail is already a stable display copy. For images we copy
    // the image itself; for video we copy the poster and leave the full video
    // to the explicit library-capture action.
    if (item.thumbnail && !R2.needsRehost(item.thumbnail)) {
      next.push(item);
      continue;
    }
    const sourceUrl =
      item.type === "video" ? (item.thumbnail ?? item.url) : item.url;
    if (!R2.needsRehost(sourceUrl)) {
      next.push(item);
      continue;
    }
    try {
      const thumbnail = await R2.putFromUrl(
        R2.buildPosterKey(
          post.brandId,
          `${post.externalId ?? post.id}-preview-${index}`,
        ),
        sourceUrl,
      );
      next.push({ ...item, thumbnail });
      stabilized++;
    } catch {
      next.push(item);
      failed++;
    }
  }

  if (stabilized) {
    await db
      .update(platformPostTable)
      .set({ media: next, scrapedAt: new Date() })
      .where(eq(platformPostTable.id, post.id));
  }
  return { stabilized, failed, total: media.length };
}

/**
 * Persist full social videos for playback in the timeline. Unlike preview
 * stabilization, this deliberately copies the media file itself—but remains
 * an explicit user action and does not create a media-library asset.
 */
export async function cachePostVideoMedia(platformPostId: string) {
  return cachePostMedia(platformPostId, { mediaTypes: ["video"] });
}

/** Explicitly persist complete post media for durable timeline playback. */
export async function cachePostMedia(
  platformPostId: string,
  options: {
    mediaTypes?: Array<"image" | "video" | "carousel">;
    force?: boolean;
  } = {},
) {
  const post = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, platformPostId),
  });
  if (!post) throw new Error("Post not found");

  const media = post.media ?? [];
  const allowed = new Set(options.mediaTypes);
  let cached = 0;
  let failed = 0;
  const next = [] as typeof media;

  for (const [index, item] of media.entries()) {
    if (
      (allowed.size > 0 && !allowed.has(item.type)) ||
      R2.isPublicUrl(item.url) ||
      (!options.force && !R2.needsRehost(item.url))
    ) {
      next.push(item);
      continue;
    }
    try {
      const response = await fetch(item.url, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok)
        throw new Error(`Video fetch failed (${response.status})`);
      const declaredSize = Number(response.headers.get("content-length") ?? 0);
      if (declaredSize > 250 * 1024 * 1024) {
        throw new Error("Video is larger than 250 MB");
      }
      const body = Buffer.from(await response.arrayBuffer());
      if (body.byteLength > 250 * 1024 * 1024) {
        throw new Error("Video is larger than 250 MB");
      }
      const contentType =
        response.headers.get("content-type")?.split(";")[0] ?? "video/mp4";
      const extension = extensionFor(contentType, item.url);
      const url = await R2.putBuffer(
        R2.buildUploadKey(
          "timeline-media",
          post.id,
          `media-${index + 1}.${extension}`,
        ),
        body,
        contentType,
      );
      next.push({ ...item, url });
      cached++;
    } catch {
      next.push(item);
      failed++;
    }
  }

  if (cached) {
    await db
      .update(platformPostTable)
      .set({ media: next, scrapedAt: new Date() })
      .where(eq(platformPostTable.id, post.id));
  }
  return { cached, failed, total: media.length };
}

/** One-time owned-history cache. This does not create media-library assets. */
export async function cacheBrandPostMedia(brandId: string) {
  const posts = await db.query.platformPostTable.findMany({
    where: eq(platformPostTable.brandId, brandId),
    columns: { id: true },
  });
  let cached = 0;
  let failed = 0;
  let processed = 0;
  for (const post of posts) {
    const result = await cachePostMedia(post.id);
    cached += result.cached;
    failed += result.failed;
    processed++;
  }
  return { processed, cached, failed };
}

/**
 * Resolve uploads the browser abandoned.
 *
 * A direct-to-R2 upload is finalized by the tab that started it, so a closed
 * tab, a dead network, or a blocked request leaves the row on `uploading`
 * with nothing left to move it. listMedia hides those after
 * STALE_UPLOAD_MINUTES, which keeps the grid clean but means a real failure
 * is invisible and a SUCCESSFUL upload whose finalize never ran is lost
 * entirely.
 *
 * So ask R2 what actually happened: bytes present means the PUT landed and
 * only the finalize was missed — promote it. Bytes absent means the upload
 * genuinely failed — mark it, so it can be reported rather than vanishing.
 */
export async function reconcileStaleUploads(brandId: string) {
  const stale = await db.query.mediaAssetTable.findMany({
    where: and(
      eq(mediaAssetTable.brandId, brandId),
      eq(mediaAssetTable.status, "uploading"),
      isNull(mediaAssetTable.deletedAt),
      sql<boolean>`${mediaAssetTable.createdAt} <= now() - make_interval(mins => ${STALE_UPLOAD_MINUTES})`,
    ),
    columns: { id: true, r2Key: true, metadata: true },
    limit: 50,
  });
  let recovered = 0;
  let failed = 0;
  for (const asset of stale) {
    if (!asset.r2Key) continue;
    const landed = await R2.head(asset.r2Key).catch(() => null);
    if (landed?.size) {
      await db
        .update(mediaAssetTable)
        .set({ status: "ready", size: landed.size })
        .where(eq(mediaAssetTable.id, asset.id));
      recovered += 1;
    } else {
      await db
        .update(mediaAssetTable)
        .set({
          status: "error",
          metadata: {
            ...(asset.metadata as Record<string, unknown> | null),
            uploadError:
              "The browser never delivered the bytes — the tab closed, the network dropped, or the request was blocked.",
          },
        })
        .where(eq(mediaAssetTable.id, asset.id));
      failed += 1;
    }
  }
  return { recovered, failed };
}

export async function listMedia(input: {
  brandId: string;
  kind?: MediaKind;
  folderId?: string | null;
  tagId?: string;
  query?: string;
}) {
  const query = input.query?.trim();
  return db.query.mediaAssetTable.findMany({
    where: and(
      eq(mediaAssetTable.brandId, input.brandId),
      // An upload still unfinalised after this long never landed — the tab
      // closed, or the PUT hung. Hide it rather than showing a dead tile.
      sql<boolean>`(${mediaAssetTable.status} <> 'uploading'
        or ${mediaAssetTable.createdAt} > now() - make_interval(mins => ${STALE_UPLOAD_MINUTES}))`,
      // `error` means the bytes are not there. Nothing purges these rows, so
      // left visible each failed upload is a permanent broken tile in the
      // library and in every picker that reads it.
      sql<boolean>`${mediaAssetTable.status} <> 'error'`,
      input.kind ? eq(mediaAssetTable.kind, input.kind) : undefined,
      input.folderId === null
        ? isNull(mediaAssetTable.folderId)
        : input.folderId
          ? eq(mediaAssetTable.folderId, input.folderId)
          : undefined,
      input.tagId
        ? sql<boolean>`exists (
            select 1 from "media_asset_tag" mat
            where mat."media_asset_id" = ${mediaAssetTable.id}
              and mat."tag_id" = ${input.tagId}
          )`
        : undefined,
      query
        ? or(
            ilike(mediaAssetTable.title, `%${query}%`),
            ilike(mediaAssetTable.filename, `%${query}%`),
            ilike(mediaAssetTable.alt, `%${query}%`),
            sql<boolean>`exists (
              select 1 from "media_asset_tag" mat
              inner join "media_tag" mt on mt."id" = mat."tag_id"
              where mat."media_asset_id" = ${mediaAssetTable.id}
                and mt."name" ilike ${`%${query}%`}
            )`,
          )
        : undefined,
      isNull(mediaAssetTable.deletedAt),
    ),
    // The storyboard is analysis input, up to a few hundred frame entries per
    // clip; nothing in a grid reads it.
    columns: { storyboard: false },
    with: {
      folder: true,
      tagAssignments: { with: { tag: true } },
    },
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
  folderId?: string | null;
  humanTagIds?: string[];
}) {
  return withTransaction(async (tx) => {
    const [updated] = await tx
      .update(mediaAssetTable)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.alt !== undefined && { alt: input.alt }),
        ...(input.folderId !== undefined && { folderId: input.folderId }),
      })
      .where(eq(mediaAssetTable.id, input.id))
      .returning();

    if (input.humanTagIds !== undefined) {
      await tx
        .delete(mediaAssetTagTable)
        .where(
          and(
            eq(mediaAssetTagTable.mediaAssetId, input.id),
            eq(mediaAssetTagTable.source, "human"),
          ),
        );
      if (input.humanTagIds.length > 0) {
        await tx.insert(mediaAssetTagTable).values(
          input.humanTagIds.map((tagId) => ({
            mediaAssetId: input.id,
            tagId,
            source: "human" as const,
          })),
        );
      }
    }

    return updated ?? null;
  });
}

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
    const ext =
      safeFilename(input.thumbnail.filename, "poster.jpg").split(".").pop() ||
      "jpg";
    thumbnailUrl = await R2.putBuffer(
      R2.buildPosterKey(input.brandId, input.id, ext),
      buffer,
      input.thumbnail.mimeType,
    );
  } else if (input.thumbnailUrl) {
    thumbnailUrl = await R2.putFromUrl(
      R2.buildPosterKey(input.brandId, input.id),
      input.thumbnailUrl,
    );
  } else if (input.thumbnailUrl === null) {
    thumbnailUrl = null;
  }

  const [updated] = await db
    .update(mediaAssetTable)
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.externalUrl !== undefined && {
        externalUrl: input.externalUrl,
        url: input.externalUrl,
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
    R2.delete(asset.r2Key).catch((error) =>
      console.error(`R2 delete failed for ${asset.id}:`, error),
    );
    // Derived objects are separate — without this they outlive the asset
    // forever. Only ours: an externally-set thumbnail isn't at this key.
    const derivedThumbnailKey = R2.buildThumbnailKey(asset.r2Key);
    if (asset.thumbnailUrl === R2.publicUrl(derivedThumbnailKey)) {
      R2.delete(derivedThumbnailKey).catch((error) =>
        console.error(`R2 thumbnail delete failed for ${asset.id}:`, error),
      );
    }
    // Storyboard boards, plus the manifest a chat upload leaves. Both keys are
    // derived, so a missing object just no-ops.
    const derivedKeys = [
      ...(asset.storyboard?.boards ?? []).map((board) => board.pathname),
      ...(asset.storyboard ? [R2.buildStoryboardManifestKey(asset.r2Key)] : []),
    ];
    for (const key of derivedKeys) {
      R2.delete(key).catch((error) =>
        console.error(`R2 storyboard delete failed for ${asset.id}:`, error),
      );
    }
  } else if (asset.provider === "stream" && asset.streamUid) {
    Stream.deleteVideo(asset.streamUid).catch((error) =>
      console.error(`Stream delete failed for ${asset.streamUid}:`, error),
    );
  }
  return { id };
}

/**
 * Prepare a direct browser → R2 upload for a transient chat attachment.
 * Deliberately NOT a media_asset row — it's an ephemeral file the chat composer
 * attaches to a message as an AI SDK file part. The image bytes never pass
 * through a Vercel function.
 */
export async function createChatR2Upload(input: {
  userId: string;
  mediaType: string;
  size: number;
  fileName?: string;
}): Promise<{
  uploadUrl: string;
  url: string;
  mediaType: string;
  thumbnailUploadUrl?: string;
  /** One presigned slot per possible board, indexed; the browser uses as many as it cut. */
  boardUploadUrls?: string[];
  manifestUploadUrl?: string;
}> {
  if (!isChatAttachmentMediaType(input.mediaType)) {
    throw new Error("Only supported images and videos can be attached");
  }
  const maximumSize = maxChatAttachmentBytes(input.mediaType);
  if (!maximumSize || input.size > maximumSize) {
    const limitLabel = chatAttachmentLimitLabel(input.mediaType);
    throw new Error(
      `${input.mediaType.startsWith("video/") ? "Video" : "Image"} is too large${limitLabel ? ` (max ${limitLabel})` : ""}`,
    );
  }

  const isVideo = input.mediaType.startsWith("video/");
  const ext = input.mediaType.split("/")[1]?.split("+")[0] ?? "png";
  // Unique key per upload so same-named pastes never collide; scoped per user.
  const filename = `${isVideo ? "video" : "image"}-${createId("att")}-${safeFilename(input.fileName ?? `paste.${ext}`)}`;
  const key = R2.buildUploadKey("chat", input.userId, filename);
  return {
    uploadUrl: await R2.presignPut(key, input.mediaType),
    url: R2.publicUrl(key),
    mediaType: input.mediaType,
    // Video gets a poster slot plus storyboard slots. Every URL is derived from
    // the video's own key, so nothing has to carry them: an AI SDK file part
    // has no field for a second URL, and the server recomputes the legal values
    // when the attachment is promoted. Presigning is a local signature, so ten
    // slots the browser may not fill cost nothing.
    ...(isVideo
      ? {
          thumbnailUploadUrl: await R2.presignPut(
            R2.buildThumbnailKey(key),
            THUMBNAIL_MIME,
          ),
          boardUploadUrls: await Promise.all(
            Array.from({ length: MAX_STORYBOARD_BOARDS }, (_, index) =>
              R2.presignPut(
                R2.buildStoryboardKey(key, index),
                STORYBOARD_BOARD_MIME,
              ),
            ),
          ),
          manifestUploadUrl: await R2.presignPut(
            R2.buildStoryboardManifestKey(key),
            "application/json",
          ),
        }
      : {}),
  };
}

/**
 * The storyboard a chat upload left beside its video, if the composer managed
 * to cut one. Read from the public bucket and validated like any client input;
 * board URLs are derived rather than taken from the manifest.
 */
async function chatAttachmentStoryboard(
  videoUrl: string,
): Promise<MediaStoryboard | null> {
  let key: string;
  try {
    if (!R2.isPublicUrl(videoUrl)) return null;
    key = new URL(videoUrl).pathname.replace(/^\//, "");
  } catch {
    return null;
  }
  const manifestUrl = R2.publicUrl(R2.buildStoryboardManifestKey(key));
  const response = await fetch(manifestUrl, {
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const parsed = storyboardDescriptorSchema.safeParse(
    await response.json().catch(() => null),
  );
  return parsed.success ? storyboardFromDescriptor(key, parsed.data) : null;
}

/**
 * The poster frame for a chat-attached video, if the composer managed to make
 * one. `createVideoThumbnail` resolves null for codecs the browser cannot
 * decode (HEVC 10-bit, most often), so existence is checked rather than
 * assumed. Returns null for anything that is not one of our chat uploads.
 */
export async function chatAttachmentPoster(
  videoUrl: string,
): Promise<string | null> {
  let key: string;
  try {
    if (!R2.isPublicUrl(videoUrl)) return null;
    key = new URL(videoUrl).pathname.replace(/^\//, "");
  } catch {
    return null;
  }
  const thumbnailKey = R2.buildThumbnailKey(key);
  const object = await R2.head(thumbnailKey).catch(() => null);
  if (!object || object.size === 0) return null;
  return R2.publicUrl(thumbnailKey);
}

/** Promote a transient chat upload into the durable media library without
 * copying bytes: chat uploads already live in our public R2 bucket. */
export async function promoteChatMedia(input: {
  brandId: string;
  userId: string;
  url: string;
  mimeType: string;
  title?: string;
}) {
  const kind = kindForMime(input.mimeType);
  if (kind !== "image" && kind !== "gif" && kind !== "video") {
    throw new Error("Only chat images, GIFs, and videos can be promoted");
  }
  if (!isOwnedChatAttachmentUrl(input.url, input.userId)) {
    throw new Error("Chat attachment does not belong to this operator");
  }
  const parsed = new URL(input.url);

  const existing = await db.query.mediaAssetTable.findFirst({
    where: and(
      eq(mediaAssetTable.brandId, input.brandId),
      eq(mediaAssetTable.url, input.url),
      isNull(mediaAssetTable.deletedAt),
    ),
  });
  if (existing) return existing;

  // The bucket root maps to R2_PUBLIC_BASE_URL, so the URL pathname is the key.
  const key = parsed.pathname.replace(/^\//, "");
  const filename = key.split("/").pop() ?? "chat-image";
  // Video is anonymous without a poster (every picker falls back to a film
  // icon, and `draftAd` cannot make a Meta video ad), and unanalyzable without
  // a storyboard. Both were cut by the composer if they exist at all.
  const [thumbnailUrl, storyboard] =
    kind === "video"
      ? await Promise.all([
          chatAttachmentPoster(input.url),
          chatAttachmentStoryboard(input.url),
        ])
      : [null, null];
  const [asset] = await db
    .insert(mediaAssetTable)
    .values({
      brandId: input.brandId,
      uploadedBy: input.userId,
      provider: "r2",
      kind,
      status: "ready",
      title: input.title?.trim() || null,
      filename,
      mimeType: input.mimeType,
      r2Key: key,
      url: input.url,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      ...(storyboard ? storyboardColumns(storyboard) : {}),
      metadata: { source: "chat_attachment" },
    })
    .returning();
  if (!asset) throw new Error("Could not save the chat image");
  return asset;
}

/**
 * Turn a URL an operator handed us mid-conversation into durable library media.
 *
 * Chat attachments are the awkward case. They are real, hosted, and usable, but
 * they carry no `media_asset` row, so an ad built straight from one has no
 * poster, no tags and no provenance — and a Meta video ad without a poster is
 * rejected outright. Promoting first is what the model was asked to do by hand
 * and predictably did not, so callers do it here instead. Idempotent: a URL
 * already in the library returns its existing row.
 *
 * Anything else (a property render, a remote image) passes through untouched.
 */
export async function resolveLibraryMedia(input: {
  brandId: string;
  userId: string;
  url: string;
}): Promise<{
  url: string;
  assetId?: string;
  thumbnailUrl?: string;
  /** The library's word on what the bytes are; absent when the URL is foreign. */
  kind?: MediaKind;
}> {
  const existing = await db.query.mediaAssetTable.findFirst({
    where: and(
      eq(mediaAssetTable.brandId, input.brandId),
      eq(mediaAssetTable.url, input.url),
      isNull(mediaAssetTable.deletedAt),
    ),
    columns: { id: true, url: true, thumbnailUrl: true, kind: true },
  });
  if (existing?.url) {
    return {
      url: existing.url,
      assetId: existing.id,
      kind: existing.kind,
      ...(existing.thumbnailUrl ? { thumbnailUrl: existing.thumbnailUrl } : {}),
    };
  }

  if (!isOwnedChatAttachmentUrl(input.url, input.userId)) {
    return { url: input.url };
  }

  // Read the type off the stored object rather than guessing from the
  // extension: the composer PUT it with the browser's own Content-Type.
  const key = new URL(input.url).pathname.replace(/^\//, "");
  const object = await R2.head(key).catch(() => null);
  const mimeType = object?.contentType;
  if (!mimeType || kindForMime(mimeType) === "file") return { url: input.url };

  const asset = await promoteChatMedia({
    brandId: input.brandId,
    userId: input.userId,
    url: input.url,
    mimeType,
  });
  return {
    url: asset.url ?? input.url,
    assetId: asset.id,
    kind: asset.kind,
    ...(asset.thumbnailUrl ? { thumbnailUrl: asset.thumbnailUrl } : {}),
  };
}

/** Image-only wrapper kept for existing callers. */
export async function promoteChatImage(input: {
  brandId: string;
  userId: string;
  url: string;
  mimeType: string;
  title?: string;
}) {
  if (!input.mimeType.startsWith("image/")) {
    throw new Error("Only chat images can be promoted");
  }
  return promoteChatMedia(input);
}

export const MediaService = {
  createR2Upload,
  failR2Upload,
  finalizeR2Upload,
  importImageBuffer,
  verifyR2Upload,
  importRemoteImage,
  markVideoReady,
  createExternal,
  capturePostMedia,
  stabilizePostMedia,
  cachePostVideoMedia,
  cachePostMedia,
  cacheBrandPostMedia,
  updateExternal,
  list: listMedia,
  reconcileStaleUploads,
  get: getMedia,
  updateMeta: updateMediaMeta,
  delete: deleteMedia,
  kindForMime,
  createChatR2Upload,
  chatAttachmentPoster,
  promoteChatImage,
  promoteChatMedia,
  resolveLibraryMedia,
} as const;
