"use client";

import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { useDropzone, type Accept } from "react-dropzone";
import { FolderOpen, Loader2, UploadCloud } from "lucide-react";

import { cn } from "./lib/utils";

const IMAGE_ACCEPT: Accept = {
  "image/*": [".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"],
};

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
export function Dropzone({
  onFiles,
  uploading = 0,
  progress,
  accept = IMAGE_ACCEPT,
  multiple = true,
  folders = multiple,
  disabled,
  className,
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
   * folder already works for free (react-dropzone walks directory entries);
   * this is the click path, which browsers only expose via `webkitdirectory`.
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
}) {
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
        "group border-border bg-muted/20 hover:border-foreground/40 hover:bg-accent/30 relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-all",
        compact ? "px-4 py-5" : "px-6 py-10",
        isDragActive && "border-primary bg-primary/10 scale-[1.01]",
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
              "text-muted-foreground animate-spin",
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
          <p className="text-muted-foreground text-sm font-medium">
            Uploading{uploading > 1 ? ` ${uploading}` : ""}…
          </p>
          {/* Per-file bars, because "is this stuck?" is the only question an
              operator has while a large video is in flight. */}
          {progress?.map((item) => (
            <div key={item.key} className="space-y-1 text-left">
              <div className="text-muted-foreground flex justify-between gap-2 text-[11px]">
                <span className="truncate">{item.name}</span>
                <span className="shrink-0 tabular-nums">
                  {Math.round(item.fraction * 100)}%
                </span>
              </div>
              <div className="bg-muted h-1 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full transition-[width] duration-200"
                  style={{ width: `${Math.round(item.fraction * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : isDragActive ? (
        <p className="text-primary text-sm font-semibold">Drop to upload</p>
      ) : (
        <div className="space-y-0.5">
          <p className={cn("font-medium", compact ? "text-xs" : "text-sm")}>
            {title ?? "Drop images here"}
          </p>
          <p className="text-muted-foreground text-xs">{hint}</p>
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
              className="text-muted-foreground hover:text-foreground mx-auto mt-1 flex items-center gap-1 text-xs underline underline-offset-2 disabled:opacity-50"
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
