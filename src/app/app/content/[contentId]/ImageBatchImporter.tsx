"use client";

import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Trash2,
} from "lucide-react";

import {
  isSupportedCarouselImagePath,
  sortCarouselPaths,
} from "@/lib/carousel-import";
import { useMediaUpload } from "@/app/app/media/use-media-upload";
import { Button } from "@/components/ui/button";
import { Dropzone } from "@/components/ui/dropzone";
import { toast } from "@/components/ui/toast";
import type { MediaItem } from "@/server/db/schema";

const MAX_ZIP_BYTES = 200 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 500 * 1024 * 1024;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 500;

const CAROUSEL_ACCEPT = {
  "image/*": [".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"],
  "application/zip": [".zip"],
  "application/x-zip-compressed": [".zip"],
};

type PendingSlide = {
  id: string;
  file: File;
  sourcePath: string;
  previewUrl: string;
  width: number;
  height: number;
};

function mimeTypeForPath(path: string) {
  const extension = path.toLowerCase().split(".").pop();
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "gif":
      return "image/gif";
    default:
      return "image/png";
  }
}

function imageDimensions(
  previewUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = previewUrl;
  });
}

async function extractZip(file: File) {
  if (file.size > MAX_ZIP_BYTES)
    throw new Error(`${file.name} exceeds the 200 MB ZIP limit.`);

  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(file);
  const entries = sortCarouselPaths(
    Object.values(zip.files).filter(
      (entry) =>
        !entry.dir && isSupportedCarouselImagePath(`archive/${entry.name}`),
    ),
    (entry) => entry.name,
  );
  if (entries.length > MAX_ARCHIVE_ENTRIES)
    throw new Error(`${file.name} contains more than 500 image files.`);

  let extractedBytes = 0;
  const files: Array<{ file: File; sourcePath: string }> = [];
  for (const entry of entries) {
    const blob = await entry.async("blob");
    extractedBytes += blob.size;
    if (extractedBytes > MAX_EXTRACTED_BYTES)
      throw new Error(`${file.name} expands beyond the 500 MB safety limit.`);
    if (blob.size > MAX_IMAGE_BYTES) {
      toast.error(`${entry.name} exceeds 25 MB and was skipped.`);
      continue;
    }
    const sourcePath = `${file.name}/${entry.name}`;
    files.push({
      file: new File([blob], entry.name.split("/").pop() ?? "slide.png", {
        type: mimeTypeForPath(entry.name),
      }),
      sourcePath,
    });
  }
  return files;
}

export function ImageBatchImporter({
  brandId,
  existingCount,
  maximum = 50,
  onImported,
}: {
  brandId: string;
  existingCount: number;
  maximum?: number;
  onImported: (items: MediaItem[]) => void | Promise<void>;
}) {
  const [slides, setSlides] = useState<PendingSlide[]>([]);
  const [processing, setProcessing] = useState(false);
  const previewUrls = useRef(new Set<string>());
  const { uploadFiles, uploading } = useMediaUpload(brandId);

  useEffect(
    () => () => {
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const releasePreview = (url: string) => {
    URL.revokeObjectURL(url);
    previewUrls.current.delete(url);
  };

  const clearSlides = () => {
    for (const slide of slides) releasePreview(slide.previewUrl);
    setSlides([]);
  };

  const stageFiles = async (selected: File[]) => {
    setProcessing(true);
    try {
      const sources: Array<{ file: File; sourcePath: string }> = [];
      for (const file of selected) {
        if (
          file.type === "application/zip" ||
          file.type === "application/x-zip-compressed" ||
          file.name.toLowerCase().endsWith(".zip")
        ) {
          sources.push(...(await extractZip(file)));
          continue;
        }
        const sourcePath =
          (
            file as File & {
              webkitRelativePath?: string;
            }
          ).webkitRelativePath || file.name;
        if (!isSupportedCarouselImagePath(`folder/${sourcePath}`)) continue;
        if (file.size > MAX_IMAGE_BYTES) {
          toast.error(`${sourcePath} exceeds 25 MB and was skipped.`);
          continue;
        }
        sources.push({ file, sourcePath });
      }

      const ordered = sortCarouselPaths(sources, (source) => source.sourcePath);
      const pending: PendingSlide[] = [];
      for (const source of ordered) {
        const previewUrl = URL.createObjectURL(source.file);
        previewUrls.current.add(previewUrl);
        const dimensions = await imageDimensions(previewUrl);
        pending.push({
          id: crypto.randomUUID(),
          ...source,
          previewUrl,
          ...dimensions,
        });
      }
      if (!pending.length) {
        toast.error("No supported images were found.");
        return;
      }
      setSlides((current) => {
        const available = Math.max(0, maximum - existingCount - current.length);
        const accepted = pending.slice(0, available);
        for (const overflow of pending.slice(available)) {
          releasePreview(overflow.previewUrl);
        }
        if (accepted.length < pending.length) {
          toast.error(
            `Only ${available} more image${available === 1 ? "" : "s"} fit in this media pool.`,
          );
        }
        return [...current, ...accepted];
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not read those files.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= slides.length) return;
    setSlides((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const remove = (index: number) => {
    setSlides((current) => {
      const removed = current[index];
      if (removed) releasePreview(removed.previewUrl);
      return current.filter((_, slideIndex) => slideIndex !== index);
    });
  };

  const busy = processing || uploading > 0;
  const importSlides = async () => {
    const items = await uploadFiles(slides.map((slide) => slide.file));
    if (!items.length) return;
    await onImported(items);
    toast.success(
      `Added ${items.length} carousel slide${items.length === 1 ? "" : "s"}.`,
    );
    clearSlides();
  };

  return (
    <div className="bg-muted/20 min-w-0 flex-1 rounded-xl border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold">Upload image batch</p>
          <p className="text-muted-foreground mt-0.5 text-[10px]">
            Add individual images, a folder, or a ZIP. Files keep their natural
            filename order for carousel work in chat.
          </p>
        </div>
        <span className="text-muted-foreground text-[10px] tabular-nums">
          {existingCount + slides.length}/{maximum}
        </span>
      </div>

      <div className="mt-3">
        <Dropzone
          compact
          multiple
          accept={CAROUSEL_ACCEPT}
          disabled={busy}
          onFiles={(files) => void stageFiles(files)}
          title="Drop images, a folder, or a ZIP"
          hint="or click to choose files"
          className="min-h-24"
        />
      </div>

      {processing && (
        <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
          <Loader2 className="size-3.5 animate-spin" />
          Reading and ordering slides…
        </p>
      )}

      {slides.length > 0 && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {slides.map((slide, index) => (
              <div
                key={slide.id}
                className="bg-background relative overflow-hidden rounded-lg border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slide.previewUrl}
                  alt={`Slide ${index + 1}`}
                  className="aspect-square w-full object-cover"
                />
                <span className="absolute top-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label={`Remove slide ${index + 1}`}
                  className="absolute top-1 right-1 rounded bg-black/65 p-1 text-white"
                >
                  <Trash2 className="size-3" />
                </button>
                <div className="absolute inset-x-1 bottom-1 flex justify-between">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move slide ${index + 1} left`}
                    className="rounded bg-black/65 p-1 text-white disabled:opacity-30"
                  >
                    <ChevronLeft className="size-3" />
                  </button>
                  <button
                    type="button"
                    disabled={index === slides.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move slide ${index + 1} right`}
                    className="rounded bg-black/65 p-1 text-white disabled:opacity-30"
                  >
                    <ChevronRight className="size-3" />
                  </button>
                </div>
                <p
                  className="text-muted-foreground truncate px-1.5 py-1 text-[9px]"
                  title={slide.sourcePath}
                >
                  {slide.sourcePath}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={clearSlides}
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void importSlides()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Archive />}
              Add {slides.length} image{slides.length === 1 ? "" : "s"} to pool
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
