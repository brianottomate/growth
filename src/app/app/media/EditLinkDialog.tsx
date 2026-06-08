"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link2, Loader2 } from "lucide-react";

import type { MediaAsset, MediaKind } from "@/server/db/schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";
import { PhotoPickerField, usePhotoPicker } from "../people/PhotoPicker";

const KIND_OPTIONS = [
  { value: "video", label: "Video" },
  { value: "image", label: "Image" },
  { value: "audio", label: "Audio" },
  { value: "file", label: "File" },
  { value: "folder", label: "Folder" },
];

/**
 * Edit a linked (external) media asset — title, URL, kind, and a thumbnail.
 * The thumbnail reuses the people `PhotoPicker` so you can paste (⌘V) an image
 * straight onto the dialog, just like a profile photo.
 */
export function EditLinkDialog({
  asset,
  open,
  onOpenChange,
  onSaved,
}: {
  asset: MediaAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const trpc = useTRPC();
  const thumb = usePhotoPicker(asset?.thumbnailUrl ?? null);
  const [title, setTitle] = useState(asset?.title ?? "");
  const [url, setUrl] = useState(asset?.externalUrl ?? "");
  const [kind, setKind] = useState<MediaKind>(asset?.kind ?? "file");

  // Re-seed the form whenever a different asset is opened (thumb omitted on
  // purpose — re-seed only on asset/open change).
  useEffect(() => {
    if (asset) {
      setTitle(asset.title ?? "");
      setUrl(asset.externalUrl ?? "");
      setKind(asset.kind);
      thumb.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id, open]);

  const updateExternal = useMutation(
    trpc.media.updateExternal.mutationOptions({
      onSuccess: () => {
        toast.success("Saved");
        onOpenChange(false);
        onSaved();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  if (!asset) return null;

  function submit() {
    if (!asset) return;
    if (!url.trim()) {
      toast.error("Link is required");
      return;
    }
    const p = thumb.payload;
    updateExternal.mutate({
      id: asset.id,
      title: title.trim(),
      externalUrl: url.trim(),
      kind,
      ...("photo" in p ? { thumbnail: p.photo } : {}),
      ...("photoUrl" in p ? { thumbnailUrl: p.photoUrl } : {}),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]" onPaste={thumb.handlePaste}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4" />
            Edit link
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <PhotoPickerField picker={thumb} />

          <div className="space-y-1.5">
            <Label htmlFor="link-title">Title</Label>
            <Input
              id="link-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. List on Wander — master"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="link-url">Link</Label>
            <Input
              id="link-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://drive.google.com/file/d/…"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <SimpleSelect
              value={kind}
              onValueChange={(v) => setKind(v as MediaKind)}
              options={KIND_OPTIONS}
              aria-label="Type"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateExternal.isPending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={updateExternal.isPending}>
            {updateExternal.isPending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
