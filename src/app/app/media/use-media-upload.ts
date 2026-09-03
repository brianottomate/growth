"use client";

import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";
import { toast } from "@/components/ui/toast";
import {
  createImageThumbnail,
  createVideoThumbnail,
  THUMBNAIL_MIME,
} from "@/lib/image-thumbnail";
import type { MediaItem } from "@/server/db/schema";

// Mirrors the media library's accepted types (src/app/app/media/MediaLibrary.tsx).
const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

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
 */
export function useMediaUpload(brandId: string) {
  const trpc = useTRPC();
  const createUploadUrl = useMutation(
    trpc.media.createUploadUrl.mutationOptions(),
  );
  const finalizeUpload = useMutation(
    trpc.media.finalizeUpload.mutationOptions(),
  );
  const [uploading, setUploading] = useState(0);

  const uploadFiles = useCallback(
    async (files: File[]): Promise<MediaItem[]> => {
      // Slot-indexed so concurrent uploads still land in the caller's order.
      const out = new Array<MediaItem | undefined>(files.length);
      let cursor = 0;
      const uploadNext = async () => {
        while (cursor < files.length) {
          const index = cursor++;
          const file = files[index]!;
          const isImage = IMAGE_TYPES.includes(file.type);
          const isVideo = VIDEO_TYPES.includes(file.type);
          if (!isImage && !isVideo) {
            toast.error(
              `${file.name}: use JPEG, PNG, WebP, AVIF, GIF, MP4, WebM or MOV`,
            );
            continue;
          }
          // Only images are capped. Video goes browser → R2 directly, so its
          // size costs us no function time and the cap would be arbitrary.
          if (isImage && file.size > MAX_IMAGE_BYTES) {
            toast.error(`${file.name} exceeds 25MB`);
            continue;
          }
          setUploading((c) => c + 1);
          try {
            // One decode yields both the true dimensions and the tile. For
            // video that is a seek to a poster frame; for an undecodable codec
            // it degrades to no poster rather than throwing.
            const { sourceWidth, sourceHeight, thumbnail } = isVideo
              ? await createVideoThumbnail(file)
              : await createImageThumbnail(file);
            const {
              mediaId,
              uploadUrl,
              publicUrl,
              pathname,
              thumbnailUploadUrl,
              thumbnailPublicUrl,
            } = await createUploadUrl.mutateAsync({
              brandId,
              filename: file.name,
              mimeType: file.type,
              size: file.size,
            });
            const put = await fetch(uploadUrl, {
              method: "PUT",
              headers: { "Content-Type": file.type },
              body: file,
            });
            if (!put.ok) throw new Error(`Upload failed (${put.status})`);

            // Best-effort: a missing tile just means the grid falls back to the
            // original, so never fail the upload over it.
            let thumbnailUrl: string | undefined;
            if (thumbnail && thumbnailUploadUrl && thumbnailPublicUrl) {
              const putThumbnail = await fetch(thumbnailUploadUrl, {
                method: "PUT",
                headers: { "Content-Type": THUMBNAIL_MIME },
                body: thumbnail,
              }).catch(() => null);
              if (putThumbnail?.ok) thumbnailUrl = thumbnailPublicUrl;
            }

            await finalizeUpload.mutateAsync({
              mediaId,
              url: publicUrl,
              pathname,
              width: sourceWidth || undefined,
              height: sourceHeight || undefined,
              hasThumbnail: Boolean(thumbnailUrl),
            });
            out[index] = {
              url: publicUrl,
              type: isVideo ? "video" : "image",
              assetId: mediaId,
              width: sourceWidth || undefined,
              height: sourceHeight || undefined,
              ...(thumbnailUrl ? { thumbnail: thumbnailUrl } : {}),
            };
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Upload failed");
          } finally {
            setUploading((c) => c - 1);
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(3, files.length) }, () => uploadNext()),
      );
      return out.filter((item): item is MediaItem => Boolean(item));
    },
    [brandId, createUploadUrl, finalizeUpload],
  );

  return { uploadFiles, uploading };
}
