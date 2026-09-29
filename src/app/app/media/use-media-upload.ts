"use client";

import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { orpc } from "@/orpc/client";
import { toast } from "@/components/ui/toast";
import {
  createImageThumbnail,
  createVideoThumbnail,
  THUMBNAIL_MIME,
} from "@/lib/image-thumbnail";
import {
  formatUploadLimit,
  isVideoMediaType,
  maxUploadBytesFor,
  MEDIA_TYPES_HINT,
  UPLOAD_CONCURRENCY,
} from "@/lib/media-accept";
import { putWithProgress } from "@/lib/upload-with-progress";
import {
  captureVideoStoryboard,
  MAX_STORYBOARD_BOARDS,
  storyboardDescriptor,
  uploadStoryboardBoards,
} from "@/lib/video-artifacts";
import type { MediaItem } from "@/server/db/schema";

export type UploadProgress = { key: string; name: string; fraction: number };

/**
 * Reusable upload hook backed by the media library's presigned direct R2 flow.
 * Returns `MediaItem`s ready to attach to a `platform_post` or an ad's creative
 * pool, with `assetId` linking back to the library.
 *
 * Video is uploaded here too, not only on the media page. It used to be
 * images-only, on the reasoning that the team worked in Drive, which left every
 * other picker telling operators to go somewhere else and come back. Bytes go
 * browser → R2 directly, so a large clip costs no function time; the poster
 * frame is cut from the file before the upload starts.
 *
 * Kept in step with the media page deliberately: both report per-file progress
 * and both mark a failed upload's row, because a row left on `uploading` has no
 * other writer and sits in the library forever.
 */
export function useMediaUpload(brandId: string) {
  const createUploadUrl = useMutation(
    orpc.media.createUploadUrl.mutationOptions(),
  );
  const finalizeUpload = useMutation(
    orpc.media.finalizeUpload.mutationOptions(),
  );
  const failUpload = useMutation(orpc.media.failUpload.mutationOptions());
  const [uploading, setUploading] = useState(0);
  const [progress, setProgress] = useState<UploadProgress[]>([]);

  const uploadFiles = useCallback(
    async (files: File[]): Promise<MediaItem[]> => {
      // Slot-indexed so concurrent uploads still land in the caller's order.
      const out = new Array<MediaItem | undefined>(files.length);
      let cursor = 0;
      const uploadNext = async () => {
        while (cursor < files.length) {
          const index = cursor++;
          const file = files[index]!;
          const isVideo = isVideoMediaType(file.type);
          const maximumBytes = maxUploadBytesFor(file.type);
          if (!maximumBytes) {
            toast.error(`${file.name}: use ${MEDIA_TYPES_HINT}`);
            continue;
          }
          // Checked up front, including for video: `media.createUploadUrl`
          // refuses anything over the same ceiling, and learning that after a
          // minute of poster-cutting surfaces as a raw zod message.
          if (file.size > maximumBytes) {
            toast.error(
              `${file.name} exceeds ${formatUploadLimit(maximumBytes)}`,
            );
            continue;
          }
          const uploadKey = `${file.name}-${file.size}-${file.lastModified}`;
          let pendingMediaId: string | null = null;
          setUploading((c) => c + 1);
          setProgress((current) => [
            ...current,
            { key: uploadKey, name: file.name, fraction: 0 },
          ]);
          try {
            // One decode yields both the true dimensions and the tile. For
            // video that is a seek to a poster frame; for an undecodable codec
            // it degrades to no poster rather than throwing.
            const { sourceWidth, sourceHeight, thumbnail } = isVideo
              ? await createVideoThumbnail(file)
              : await createImageThumbnail(file);
            const created = await createUploadUrl.mutateAsync({
              brandId,
              filename: file.name,
              mimeType: file.type,
              size: file.size,
              // Slots for every board we might cut; presigning is free.
              boardCount: isVideo ? MAX_STORYBOARD_BOARDS : 0,
            });
            pendingMediaId = created.mediaId;
            const {
              mediaId,
              uploadUrl,
              publicUrl,
              pathname,
              thumbnailUploadUrl,
              thumbnailPublicUrl,
              boardUploads,
            } = created;
            // The storyboard is what makes the clip analyzable later, from
            // anywhere, and the browser is the only place it can be cut. It
            // runs alongside the PUT so a long clip is not stuck at 0% while
            // frames are sampled.
            const [, storyboard] = await Promise.all([
              // XHR rather than fetch: only XHR reports upload progress, and a
              // 100MB clip behind an indeterminate spinner reads as a hang.
              putWithProgress(uploadUrl, file, {
                contentType: file.type,
                onProgress: (fraction) =>
                  setProgress((current) =>
                    current.map((item) =>
                      item.key === uploadKey ? { ...item, fraction } : item,
                    ),
                  ),
              }),
              isVideo ? captureVideoStoryboard(file) : Promise.resolve(null),
            ]);

            // Best-effort: a missing tile just means the grid falls back to the
            // original, so never fail the upload over it.
            let thumbnailUrl: string | undefined;
            if (thumbnail && thumbnailUploadUrl && thumbnailPublicUrl) {
              const landed = await putWithProgress(
                thumbnailUploadUrl,
                thumbnail,
                { contentType: THUMBNAIL_MIME },
              ).then(
                () => true,
                () => false,
              );
              if (landed) thumbnailUrl = thumbnailPublicUrl;
            }

            const landedBoards = storyboard
              ? await uploadStoryboardBoards(
                  storyboard,
                  (boardIndex) =>
                    boardUploads.find((slot) => slot.index === boardIndex)
                      ?.uploadUrl,
                )
              : new Set<number>();
            const descriptor = storyboard
              ? storyboardDescriptor(storyboard, landedBoards)
              : null;

            await finalizeUpload.mutateAsync({
              mediaId,
              url: publicUrl,
              pathname,
              width: sourceWidth || undefined,
              height: sourceHeight || undefined,
              hasThumbnail: Boolean(thumbnailUrl),
              ...(descriptor ? { storyboard: descriptor } : {}),
            });
            pendingMediaId = null;
            if (isVideo) {
              // Fire and forget: the server cuts the publishable H.264 files,
              // and the hourly sweep retries anything this request misses.
              void fetch("/api/media/renditions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ mediaId }),
                keepalive: true,
              }).catch(() => undefined);
            }
            out[index] = {
              url: publicUrl,
              type: isVideo ? "video" : "image",
              assetId: mediaId,
              width: sourceWidth || undefined,
              height: sourceHeight || undefined,
              ...(thumbnailUrl ? { thumbnail: thumbnailUrl } : {}),
            };
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Upload failed";
            // The reserved row's only other writer is the finalize that never
            // ran, so without this it stays `uploading` in the library forever.
            if (pendingMediaId) {
              await failUpload
                .mutateAsync({ mediaId: pendingMediaId, reason: message })
                .catch(() => undefined);
            }
            toast.error(message);
          } finally {
            setUploading((c) => c - 1);
            setProgress((current) =>
              current.filter((item) => item.key !== uploadKey),
            );
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, () =>
          uploadNext(),
        ),
      );
      return out.filter((item): item is MediaItem => Boolean(item));
    },
    [brandId, createUploadUrl, failUpload, finalizeUpload],
  );

  return { uploadFiles, uploading, progress };
}
