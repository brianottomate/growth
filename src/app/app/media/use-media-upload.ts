"use client";

import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";
import { toast } from "@/components/ui/toast";
import type { MediaItem } from "@/server/db/schema";

// Mirrors the media library's accepted types (src/app/app/media/MediaLibrary.tsx).
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Reusable image-upload hook backed by the media library's presigned direct
 * R2 upload flow. It returns
 * `MediaItem`s ready to attach to a `platform_post` (with `assetId` linking back
 * to the library). Video stays on the Drive-link path for now — the team works
 * in Drive and `assetLinks` already carries those.
 */
export function useMediaUpload(brandId: string) {
  const trpc = useTRPC();
  const createUploadUrl = useMutation(trpc.media.createUploadUrl.mutationOptions());
  const finalizeUpload = useMutation(trpc.media.finalizeUpload.mutationOptions());
  const [uploading, setUploading] = useState(0);

  const uploadImages = useCallback(
    async (files: File[]): Promise<MediaItem[]> => {
      const out: MediaItem[] = [];
      for (const file of files) {
        if (!IMAGE_TYPES.includes(file.type)) {
          toast.error(`${file.name}: only images upload here — paste a link for video`);
          continue;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          toast.error(`${file.name} exceeds 25MB`);
          continue;
        }
        setUploading((c) => c + 1);
        try {
          const dims = await readImageDimensions(file);
          const { mediaId, uploadUrl, publicUrl, pathname } =
            await createUploadUrl.mutateAsync({
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
          await finalizeUpload.mutateAsync({
            mediaId,
            url: publicUrl,
            pathname,
            width: dims.width || undefined,
            height: dims.height || undefined,
          });
          out.push({
            url: publicUrl,
            type: "image",
            assetId: mediaId,
            width: dims.width || undefined,
            height: dims.height || undefined,
          });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Upload failed");
        } finally {
          setUploading((c) => c - 1);
        }
      }
      return out;
    },
    [brandId, createUploadUrl, finalizeUpload],
  );

  return { uploadImages, uploading };
}
