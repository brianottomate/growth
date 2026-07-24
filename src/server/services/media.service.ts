import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import { db, withTransaction } from "../db";
import type { MediaKind } from "../db/schema";
import {
  mediaAssetTable,
  mediaAssetTagTable,
  platformPostTable,
} from "../db/schema";
import { createId } from "../db/utils";
import { R2 } from "../clients/r2.client";
import { Stream } from "../clients/stream.client";
import { isOwnedChatImageUrl } from "@/lib/chat-attachment";
import { classifyFetchUrl } from "@/server/ai/url-safety";

export const MEDIA_MIME = {
  image: ["image/jpeg", "image/png", "image/webp", "image/avif"],
  gif: ["image/gif"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
} as const;

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

async function fetchPublicImage(rawUrl: string): Promise<{
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
    if (
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/avif",
        "image/gif",
      ].includes(contentType)
    ) {
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

  // Images also get a presigned slot for a browser-downscaled tile. The grid
  // renders that instead of a multi-megabyte original; callers that skip it
  // just leave `thumbnailUrl` null and fall back to the full image.
  const thumbnail =
    kind === "image"
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

  return {
    mediaId: asset.id,
    uploadUrl,
    publicUrl,
    pathname: key,
    ...(thumbnail ?? {}),
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
}) {
  const asset = await getMedia(input.mediaId);
  if (asset?.provider !== "r2") return null;
  if (asset.r2Key !== input.pathname || asset.url !== input.url) {
    throw new Error("Upload does not match the media asset");
  }

  // Derived, never client-supplied — the only key the presign could have been
  // issued for.
  const thumbnailUrl = input.hasThumbnail
    ? R2.publicUrl(R2.buildThumbnailKey(asset.r2Key))
    : null;

  const [updated] = await db
    .update(mediaAssetTable)
    .set({
      status: "ready",
      width: input.width ?? null,
      height: input.height ?? null,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
    })
    .where(eq(mediaAssetTable.id, input.mediaId))
    .returning();
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
    // Derived tiles are separate objects — without this they outlive the asset
    // forever. Only ours: an externally-set thumbnail isn't at this key.
    const derivedThumbnailKey = R2.buildThumbnailKey(asset.r2Key);
    if (asset.thumbnailUrl === R2.publicUrl(derivedThumbnailKey)) {
      R2.delete(derivedThumbnailKey).catch((error) =>
        console.error(`R2 thumbnail delete failed for ${asset.id}:`, error),
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
 * Upload a transient chat attachment (a pasted/dropped image) to R2 and return
 * its public URL. Deliberately NOT a media_asset row — it's an ephemeral file
 * the chat composer attaches to a message as an AI SDK file part.
 */
export async function uploadChatImage(input: {
  dataUrl: string;
  userId: string;
  fileName?: string;
}): Promise<{ url: string; mediaType: string }> {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(input.dataUrl);
  if (!match) throw new Error("Expected a base64-encoded image data URL");
  const mediaType = match[1]!;
  if (!mediaType.startsWith("image/"))
    throw new Error("Only images can be attached");
  const buffer = Buffer.from(match[2]!, "base64");
  if (buffer.byteLength > 10 * 1024 * 1024)
    throw new Error("Image is too large (max 10MB)");

  const ext = mediaType.split("/")[1]?.split("+")[0] ?? "png";
  // Unique key per upload so same-named pastes never collide; scoped per user.
  const filename = `${createId("att")}-${safeFilename(input.fileName ?? `paste.${ext}`)}`;
  const key = R2.buildUploadKey("chat", input.userId, filename);
  const url = await R2.putBuffer(key, buffer, mediaType);
  return { url, mediaType };
}

/** Promote a transient chat image into the durable media library without
 * copying bytes: chat uploads already live in our public R2 bucket. */
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
  if (!isOwnedChatImageUrl(input.url, input.userId)) {
    throw new Error("Chat image does not belong to this operator");
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
  const [asset] = await db
    .insert(mediaAssetTable)
    .values({
      brandId: input.brandId,
      uploadedBy: input.userId,
      provider: "r2",
      kind: "image",
      status: "ready",
      title: input.title?.trim() || null,
      filename,
      mimeType: input.mimeType,
      r2Key: key,
      url: input.url,
      metadata: { source: "chat_attachment" },
    })
    .returning();
  if (!asset) throw new Error("Could not save the chat image");
  return asset;
}

export const MediaService = {
  createR2Upload,
  finalizeR2Upload,
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
  get: getMedia,
  updateMeta: updateMediaMeta,
  delete: deleteMedia,
  kindForMime,
  uploadChatImage,
  promoteChatImage,
} as const;
