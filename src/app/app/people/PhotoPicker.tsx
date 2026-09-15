"use client";

import { useRef, useState, type ClipboardEvent } from "react";
import { ImagePlus } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { cn } from "@/components/ui/lib/utils";

export const MAX_PHOTO_BYTES = 4.5 * 1024 * 1024;

export type Photo = { base64Data: string; mimeType: string; filename: string };

/** The shape `createPerson` / `updatePerson` accept for a photo source. */
export type PhotoPayload =
  | { photo: Photo }
  | { photoUrl: string }
  | Record<string, never>;

function fileToPhoto(file: File): Promise<Photo> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(",")[1] ?? "";
      resolve({ base64Data, mimeType: file.type, filename: file.name });
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Stateful profile-photo picker shared by the Add/Edit person dialogs. Supports
 * a file upload, clipboard paste (via `handlePaste`, wire it to the dialog's
 * `onPaste`), or an image URL behind a toggle. `payload` is ready to spread
 * into the mutation input; `changed` tells whether the user picked anything.
 */
export function usePhotoPicker(initialPreview: string | null = null) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [urlMode, setUrlMode] = useState(false);
  const [preview, setPreview] = useState<string | null>(initialPreview);

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error("Photo exceeds 4.5MB");
      return;
    }
    setPhotoUrl(""); // a file takes precedence over a URL
    setPhoto(await fileToPhoto(file));
    setPreview(URL.createObjectURL(file));
  }

  function handleUrl(url: string) {
    setPhotoUrl(url);
    setPhoto(null); // a URL replaces any picked/pasted file
    setPreview(url.trim() || initialPreview);
  }

  // Paste an image straight from the clipboard (e.g. ⌘C on a Slack avatar).
  function handlePaste(e: ClipboardEvent) {
    const file = Array.from(e.clipboardData.items)
      .find((item) => item.type.startsWith("image/"))
      ?.getAsFile();
    if (file) {
      e.preventDefault();
      void handlePhoto(file);
    }
  }

  function toggleUrlMode() {
    setUrlMode((v) => {
      const next = !v;
      if (!next) handleUrl(""); // leaving URL mode clears it
      return next;
    });
  }

  function reset() {
    setPhoto(null);
    setPhotoUrl("");
    setUrlMode(false);
    setPreview(initialPreview);
  }

  const payload: PhotoPayload = photo
    ? { photo }
    : photoUrl.trim()
      ? { photoUrl: photoUrl.trim() }
      : {};
  const changed = photo !== null || photoUrl.trim() !== "";

  return {
    photoUrl,
    urlMode,
    preview,
    handlePhoto,
    handleUrl,
    handlePaste,
    toggleUrlMode,
    reset,
    payload,
    changed,
  };
}

/** Presentational counterpart to `usePhotoPicker`. */
export function PhotoPickerField({
  picker,
  variant = "avatar",
  label = "Optional profile photo",
  help = "click or paste (⌘V) · ≤4.5MB",
  idPrefix = "photo",
}: {
  picker: ReturnType<typeof usePhotoPicker>;
  variant?: "avatar" | "banner";
  label?: string;
  help?: string;
  idPrefix?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={cn(
            "flex shrink-0 items-center justify-center overflow-hidden border bg-muted",
            variant === "banner"
              ? "h-20 w-40 rounded-lg"
              : "size-14 rounded-full",
            "transition-colors hover:border-primary",
          )}
        >
          {picker.preview ? (
            // oxlint-disable-next-line nextjs/no-img-element
            <img
              src={picker.preview}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <ImagePlus className="size-5 text-muted-foreground" />
          )}
        </button>
        <div className="text-xs text-muted-foreground">
          {label} · {help}
          <br />
          <button
            type="button"
            className="underline underline-offset-2 transition-colors hover:text-foreground"
            onClick={picker.toggleUrlMode}
          >
            {picker.urlMode
              ? "Upload a file instead"
              : "Use an image URL instead"}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="hidden"
          onChange={(e) => void picker.handlePhoto(e.target.files?.[0])}
        />
      </div>

      {picker.urlMode && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-url`}>{label} URL</Label>
          <Input
            id={`${idPrefix}-url`}
            type="url"
            value={picker.photoUrl}
            onChange={(e) => picker.handleUrl(e.target.value)}
            placeholder="https://… (e.g. a Slack avatar)"
          />
        </div>
      )}
    </>
  );
}
