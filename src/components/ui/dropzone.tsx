"use client";

import { useCallback } from "react";
import { useDropzone, type Accept } from "react-dropzone";
import { Loader2, UploadCloud } from "lucide-react";

import { cn } from "./lib/utils";

const IMAGE_ACCEPT: Accept = {
  "image/*": [".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"],
};

/**
 * A friendly drag-and-drop upload zone (react-dropzone, already a dep). Big
 * dashed target, drag-active highlight, click-to-browse, and an in-flight
 * spinner. Emits accepted `File[]`; the caller owns the upload (e.g. via
 * `useMediaUpload`). Borrowed/themed from the swipestats FileUploadZone.
 */
export function Dropzone({
  onFiles,
  uploading = 0,
  accept = IMAGE_ACCEPT,
  multiple = true,
  disabled,
  className,
  compact = false,
  title,
  hint = "or click to browse · saved to your library",
}: {
  onFiles: (files: File[]) => void;
  /** Count of uploads in flight — shows the spinner + disables the zone. */
  uploading?: number;
  accept?: Accept;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
  title?: string;
  hint?: string;
}) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length) onFiles(accepted);
    },
    [onFiles],
  );
  const busy = uploading > 0;
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    multiple,
    disabled: disabled || busy,
  });

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
      <div
        className={cn(
          "rounded-xl p-2.5 transition-colors",
          isDragActive ? "bg-primary/15" : "bg-muted group-hover:bg-accent",
        )}
      >
        {busy ? (
          <Loader2
            className={cn("text-muted-foreground animate-spin", compact ? "size-5" : "size-7")}
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
        <p className="text-muted-foreground text-sm font-medium">
          Uploading{uploading > 1 ? ` ${uploading}` : ""}…
        </p>
      ) : isDragActive ? (
        <p className="text-primary text-sm font-semibold">Drop to upload</p>
      ) : (
        <div className="space-y-0.5">
          <p className={cn("font-medium", compact ? "text-xs" : "text-sm")}>
            {title ?? "Drop images here"}
          </p>
          <p className="text-muted-foreground text-xs">{hint}</p>
        </div>
      )}
    </div>
  );
}
