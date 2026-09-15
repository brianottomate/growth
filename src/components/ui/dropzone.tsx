"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { useDropzone, type Accept } from "react-dropzone";
import { FolderOpen, Loader2, UploadCloud } from "lucide-react";

import { cn } from "./lib/utils";
import { droppedFiles } from "@/lib/dropped-files";
import {
  MEDIA_ACCEPT as SHARED_MEDIA_ACCEPT,
  STILL_MEDIA_ACCEPT,
} from "@/lib/media-accept";

const IMAGE_ACCEPT: Accept = STILL_MEDIA_ACCEPT;

/** Images plus the video types the media library stores. */
export const MEDIA_ACCEPT: Accept = SHARED_MEDIA_ACCEPT;

/**
 * Folder picks bypass react-dropzone's own filtering, so we re-apply the
 * `accept` map by hand — otherwise `.DS_Store`, sidecar text files and other
 * folder debris ride along into the upload.
 */
function acceptsFile(file: File, accept?: Accept) {
  const name = file.name.toLowerCase();
  if (name.startsWith(".")) return false;
  if (!accept) return true;
  return Object.entries(accept).some(([mime, extensions]) => {
    if (extensions.some((extension) => name.endsWith(extension.toLowerCase())))
      return true;
    if (mime.endsWith("/*")) return file.type.startsWith(mime.slice(0, -1));
    return file.type === mime;
  });
}

/**
 * A friendly drag-and-drop upload zone (react-dropzone, already a dep). Big
 * dashed target, drag-active highlight, click-to-browse, and an in-flight
 * spinner. Emits accepted `File[]`; the caller owns the upload (e.g. via
 * `useMediaUpload`). Borrowed/themed from the swipestats FileUploadZone.
 */
const dropzoneStyleVariants = cva("", {
  variants: { density: { thumbnail: "p-0 text-[9px]" } },
});

export function Dropzone({
  onFiles,
  uploading = 0,
  progress,
  accept = IMAGE_ACCEPT,
  multiple = true,
  folders = multiple,
  disabled,
  className: customClassName,
  density,
  compact = false,
  title,
  hint = "or click to browse · saved to your library",
  openRef,
}: {
  onFiles: (files: File[]) => void;
  /** Count of uploads in flight — shows the spinner + disables the zone. */
  uploading?: number;
  /** Per-file progress for those uploads, 0 to 1 each. */
  progress?: { key: string; name: string; fraction: number }[];
  accept?: Accept;
  multiple?: boolean;
  /**
   * Offer a "choose a folder" affordance alongside click-to-browse. Dropping a
   * folder already works (`droppedFiles` walks directory entries); this is the
   * click path, which browsers only expose via `webkitdirectory`.
   * Defaults on wherever multiple files are allowed.
   */
  folders?: boolean;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
  title?: string;
  hint?: string;
  /** Receives an `open()` you can call to trigger the file picker elsewhere. */
  openRef?: MutableRefObject<(() => void) | null>;
} & VariantProps<typeof dropzoneStyleVariants>) {
  const className = cn(dropzoneStyleVariants({ density }), customClassName);

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length) onFiles(accepted);
    },
    [onFiles],
  );
  const busy = uploading > 0;
  const folderInput = useRef<HTMLInputElement | null>(null);
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept,
    multiple,
    disabled: disabled || busy,
    // The default reader asks the platform for a file handle and dies on the
    // sources it refuses; see `droppedFiles`.
    getFilesFromEvent: droppedFiles,
  });
  useEffect(() => {
    if (!openRef) return;
    openRef.current = open;
    return () => {
      openRef.current = null;
    };
  }, [openRef, open]);

  return (
    <div
      {...getRootProps()}
      className={cn(
        "group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 text-center transition-all hover:border-foreground/40 hover:bg-accent/30",
        compact ? "px-4 py-5" : "px-6 py-10",
        isDragActive && "scale-[1.01] border-primary bg-primary/10",
        (disabled || busy) && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <input {...getInputProps()} />
      {folders && (
        <input
          // `webkitdirectory` is how every browser exposes folder picking, but
          // it is missing from React's input typings — hence the ref callback.
          ref={(node) => {
            folderInput.current = node;
            node?.setAttribute("webkitdirectory", "");
          }}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            const picked = Array.from(event.currentTarget.files ?? []).filter(
              (file) => acceptsFile(file, accept),
            );
            event.currentTarget.value = "";
            if (picked.length) onFiles(picked);
          }}
        />
      )}
      <div
        className={cn(
          "rounded-xl p-2.5 transition-colors",
          isDragActive ? "bg-primary/15" : "bg-muted group-hover:bg-accent",
        )}
      >
        {busy ? (
          <Loader2
            className={cn(
              "animate-spin text-muted-foreground",
              compact ? "size-5" : "size-7",
            )}
          />
        ) : (
          <UploadCloud
            className={cn(
              isDragActive
                ? "text-primary"
                : "text-muted-foreground group-hover:text-foreground",
              compact ? "size-5" : "size-7",
            )}
          />
        )}
      </div>
      {busy ? (
        <div className="w-full max-w-sm space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Uploading{uploading > 1 ? ` ${uploading}` : ""}…
          </p>
          {/* Per-file bars, because "is this stuck?" is the only question an
              operator has while a large video is in flight. */}
          {progress?.map((item) => (
            <div key={item.key} className="space-y-1 text-left">
              <div className="flex justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">{item.name}</span>
                <span className="shrink-0 tabular-nums">
                  {Math.round(item.fraction * 100)}%
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width] duration-200"
                  style={{ width: `${Math.round(item.fraction * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : isDragActive ? (
        <p className="text-sm font-semibold text-primary">Drop to upload</p>
      ) : (
        <div className="space-y-0.5">
          <p className={cn("font-medium", compact ? "text-xs" : "text-sm")}>
            {title ?? "Drop images here"}
          </p>
          <p className="text-xs text-muted-foreground">{hint}</p>
          {folders && (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={(event) => {
                // The zone itself opens the file picker on click — keep the
                // folder button from triggering both dialogs.
                event.stopPropagation();
                folderInput.current?.click();
              }}
              className="mx-auto mt-1 flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
            >
              <FolderOpen className="size-3" />
              Choose a folder
            </button>
          )}
        </div>
      )}
    </div>
  );
}
