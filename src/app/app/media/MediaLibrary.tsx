"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  Film,
  FileText,
  FolderOpen,
  ImageIcon,
  Link2,
  Loader2,
  Pencil,
  Rocket,
  Trash2,
  UploadCloud,
} from "lucide-react";

import type { MediaAsset, MediaKind } from "@/server/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
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
import { cn } from "@/components/ui/lib/utils";
import { useTRPC } from "@/trpc/react";
import { EditLinkDialog } from "./EditLinkDialog";
import { PhotoPickerField, usePhotoPicker } from "../people/PhotoPicker";
/**
 * Build a deep-link to the launch planner with this media prefilled as the hero
 * creative. No separate drawer — /launch owns the whole generate→review→commit
 * flow; we just hand it a brief + (when we host one) a reference image.
 */
function launchHref(opts: {
  brandId: string;
  title: string;
  href: string | null;
  imageUrl?: string | null;
  kind: string;
  sourceProvider?: string | null;
}): string {
  const ref = [
    `Hero creative: "${opts.title}" (${opts.kind}${opts.sourceProvider ? `, ${opts.sourceProvider}` : ""}).`,
    opts.href ? `Link: ${opts.href}` : null,
    "Plan how to launch this piece across channels.",
  ]
    .filter(Boolean)
    .join(" ");
  const params = new URLSearchParams({ brandId: opts.brandId, name: opts.title, prompt: ref });
  if (opts.imageUrl) params.set("img", opts.imageUrl);
  return `/app/plan?${params.toString()}`;
}

/** Deep-link for a media asset (only hand the model a URL it can actually fetch). */
function assetLaunchHref(asset: MediaAsset, brandId: string): string {
  const isExternal = asset.provider === "external";
  return launchHref({
    brandId,
    title: asset.title ?? asset.filename ?? "Untitled",
    href: asset.externalUrl ?? asset.url,
    imageUrl: isExternal ? null : asset.kind === "image" ? asset.url : asset.thumbnailUrl,
    kind: asset.kind,
    sourceProvider: isExternal ? (asset.sourceProvider ?? "link") : null,
  });
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES].join(",");
const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25MB (R2)

type Brand = { id: string; name: string; logo: string | null };

const KIND_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All media" },
  { value: "image", label: "Images" },
  { value: "video", label: "Video" },
  { value: "gif", label: "GIFs" },
];

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = URL.createObjectURL(file);
  });
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function MediaLibrary({ brands }: { brands: Brand[] }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [brandId, setBrandId] = useState(brands[0]!.id);
  const [filter, setFilter] = useState<string>("all");
  const [dragActive, setDragActive] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // "Add link" (external asset) dialog state.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkKind, setLinkKind] = useState<MediaKind>("video");
  const linkThumb = usePhotoPicker();

  // "Edit link" dialog — the asset currently being edited.
  const [editingAsset, setEditingAsset] = useState<MediaAsset | null>(null);


  const listInput = {
    brandId,
    ...(filter !== "all" ? { kind: filter as MediaKind } : {}),
  };
  const listOpts = trpc.media.list.queryOptions(listInput);
  const { data: assets, isLoading } = useQuery(listOpts);

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: listOpts.queryKey }),
    [queryClient, listOpts.queryKey],
  );

  const createUploadUrl = useMutation(trpc.media.createUploadUrl.mutationOptions());
  const finalizeUpload = useMutation(trpc.media.finalizeUpload.mutationOptions());
  const createVideoUpload = useMutation(trpc.media.createVideoUpload.mutationOptions());
  const syncVideo = useMutation(trpc.media.syncVideo.mutationOptions());
  const finalizeLinkCreate = () => {
    toast.success("Link added");
    setLinkOpen(false);
    setLinkUrl("");
    setLinkTitle("");
    linkThumb.reset();
    void invalidate();
  };

  // A pasted/uploaded thumbnail can't go in until the asset row exists, so we
  // create the link first, then run a quick updateExternal to attach it.
  const updateThumb = useMutation(
    trpc.media.updateExternal.mutationOptions({
      onSuccess: () => finalizeLinkCreate(),
      // The link itself was created — only the thumbnail failed; still finish.
      onError: (e) => {
        toast.error(`Link added, but thumbnail failed: ${e.message}`);
        finalizeLinkCreate();
      },
    }),
  );
  const createExternal = useMutation(
    trpc.media.createExternal.mutationOptions({
      onSuccess: (created) => {
        const p = linkThumb.payload;
        if ("photo" in p) {
          updateThumb.mutate({ id: created.id, thumbnail: p.photo });
        } else if ("photoUrl" in p) {
          updateThumb.mutate({ id: created.id, thumbnailUrl: p.photoUrl });
        } else {
          finalizeLinkCreate();
        }
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const deleteMedia = useMutation(
    trpc.media.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Deleted");
        void invalidate();
      },
    }),
  );

  // --- upload one file (routes image→R2, video→Stream) ---
  const uploadFile = useCallback(
    async (file: File) => {
      const isImage = IMAGE_TYPES.includes(file.type);
      const isVideo = VIDEO_TYPES.includes(file.type);
      if (!isImage && !isVideo) {
        toast.error(`Unsupported file type: ${file.type || file.name}`);
        return;
      }
      if (isImage && file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name} exceeds 25MB`);
        return;
      }

      setUploadingCount((c) => c + 1);
      try {
        if (isImage) {
          const dims = await readImageDimensions(file);
          const { mediaId, uploadUrl } = await createUploadUrl.mutateAsync({
            brandId,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
          });
          const put = await fetch(uploadUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type },
          });
          if (!put.ok) throw new Error(`R2 upload failed (${put.status})`);
          await finalizeUpload.mutateAsync({
            mediaId,
            width: dims.width || undefined,
            height: dims.height || undefined,
          });
        } else {
          const { uploadUrl } = await createVideoUpload.mutateAsync({
            brandId,
            filename: file.name,
          });
          const form = new FormData();
          form.append("file", file);
          const post = await fetch(uploadUrl, { method: "POST", body: form });
          if (!post.ok) throw new Error(`Stream upload failed (${post.status})`);
        }
        toast.success(`Uploaded ${file.name}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploadingCount((c) => c - 1);
        void invalidate();
      }
    },
    [brandId, createUploadUrl, finalizeUpload, createVideoUpload, invalidate],
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      await Promise.all(Array.from(files).map((f) => uploadFile(f)));
    },
    [uploadFile],
  );

  // --- poll still-processing videos until ready ---
  const processing = (assets ?? []).filter((a) => a.status === "processing");
  useEffect(() => {
    if (processing.length === 0) return;
    const t = setInterval(() => {
      void (async () => {
        let changed = false;
        for (const a of processing) {
          const res = await syncVideo.mutateAsync({ mediaId: a.id }).catch(() => null);
          if (res?.status === "ready") changed = true;
        }
        if (changed) void invalidate();
      })();
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processing.map((a) => a.id).join(",")]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Media</h1>
          <p className="text-muted-foreground text-sm">
            Reusable creative for Studio · images on R2, video on Cloudflare Stream
          </p>
        </div>
        <div className="flex items-center gap-2">
          {brands.length > 1 && (
            <SimpleSelect
              value={brandId}
              onValueChange={setBrandId}
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
              aria-label="Brand"
              size="sm"
            />
          )}
          <SimpleSelect
            value={filter}
            onValueChange={setFilter}
            options={KIND_FILTERS}
            aria-label="Filter"
            size="sm"
          />
          <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
            <Link2 className="size-4" />
            Add link
          </Button>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingCount > 0}
          >
            {uploadingCount > 0 ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UploadCloud className="size-4" />
            )}
            Upload
          </Button>
        </div>
      </div>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent onPaste={linkThumb.handlePaste}>
          <DialogHeader>
            <DialogTitle>Link an external file</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <p className="text-muted-foreground text-xs">
              Reference a file we don&apos;t host — a Google Drive / Dropbox / Frame.io
              master (e.g. a heavy working video). Cut-downs you publish get hosted
              separately and can link back to this as their source.
            </p>
            <PhotoPickerField picker={linkThumb} />
            <div className="flex flex-col gap-1.5">
              <Label>Link</Label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/…"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Title</Label>
                <Input
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  placeholder="e.g. List on Wander — master"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Type</Label>
                <SimpleSelect
                  value={linkKind}
                  onValueChange={(v) => setLinkKind(v as MediaKind)}
                  options={[
                    { value: "video", label: "Video" },
                    { value: "image", label: "Image" },
                    { value: "audio", label: "Audio" },
                    { value: "file", label: "File" },
                    { value: "folder", label: "Folder" },
                  ]}
                  aria-label="Type"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                linkThumb.reset();
                setLinkOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              loading={createExternal.isPending || updateThumb.isPending}
              disabled={!linkUrl.trim()}
              onClick={() =>
                createExternal.mutate({
                  brandId,
                  externalUrl: linkUrl.trim(),
                  title: linkTitle.trim() || undefined,
                  kind: linkKind,
                })
              }
            >
              Add link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dropzone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragActive(false);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-10 text-center transition-colors",
          dragActive ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <UploadCloud className="text-muted-foreground size-6" />
        <p className="text-sm font-medium">Drop images or video, or click to browse</p>
        <p className="text-muted-foreground text-xs">
          JPEG · PNG · WebP · GIF (≤25MB) · MP4 · WebM · MOV
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (assets ?? []).length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No media yet. Upload your first asset above.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {(assets ?? []).map((asset) => (
            <MediaCard
              key={asset.id}
              asset={asset}
              onDelete={() => deleteMedia.mutate({ id: asset.id })}
              onEdit={
                asset.provider === "external"
                  ? () => setEditingAsset(asset)
                  : undefined
              }
              launchHref={assetLaunchHref(asset, brandId)}
            />
          ))}
        </div>
      )}

      <EditLinkDialog
        asset={editingAsset}
        open={editingAsset !== null}
        onOpenChange={(open) => !open && setEditingAsset(null)}
        onSaved={() => void invalidate()}
      />
    </div>
  );
}

function MediaCard({
  asset,
  onDelete,
  onEdit,
  launchHref,
}: {
  asset: MediaAsset;
  onDelete: () => void;
  onEdit?: () => void;
  launchHref: string;
}) {
  const isVideo = asset.kind === "video";
  const isExternal = asset.provider === "external";
  const externalHref = asset.externalUrl ?? asset.url;
  const preview = isVideo || isExternal ? asset.thumbnailUrl : asset.url;
  const KindIcon =
    asset.kind === "folder"
      ? FolderOpen
      : isVideo
        ? Film
        : asset.kind === "image"
          ? ImageIcon
          : FileText;

  return (
    <div className="group bg-muted/30 relative overflow-hidden rounded-lg border">
      <div className="bg-muted relative aspect-square">
        {asset.status === "processing" ? (
          <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs">
            <Loader2 className="size-5 animate-spin" />
            Processing…
          </div>
        ) : isExternal ? (
          <a
            href={externalHref ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="group/link text-muted-foreground hover:text-foreground absolute inset-0 flex flex-col items-center justify-center gap-1.5 transition-colors"
          >
            {preview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt={asset.title ?? ""}
                  className="size-full object-cover"
                  loading="lazy"
                />
                <span className="absolute inset-0 flex items-center justify-center gap-1 bg-black/40 text-[11px] text-white opacity-0 transition-opacity group-hover/link:opacity-100">
                  <ExternalLink className="size-3" />
                  Open link
                </span>
              </>
            ) : (
              <>
                <KindIcon className="size-7" />
                <span className="flex items-center gap-1 text-[11px]">
                  <ExternalLink className="size-3" />
                  Open link
                </span>
              </>
            )}
          </a>
        ) : preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={asset.alt ?? asset.filename ?? ""}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="text-muted-foreground absolute inset-0 flex items-center justify-center">
            <KindIcon className="size-6" />
          </div>
        )}

        <Badge
          variant="outline"
          className="absolute top-1.5 left-1.5 gap-1 bg-black/55 text-[10px] text-white backdrop-blur"
        >
          {isExternal ? <Link2 className="size-3" /> : <KindIcon className="size-3" />}
          {isExternal ? (asset.sourceProvider ?? "link") : asset.kind}
        </Badge>

        <div className="pointer-events-none absolute inset-0 flex items-end justify-end gap-1.5 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <ButtonLink
            size="icon"
            variant="secondary"
            className="pointer-events-auto mr-auto size-7"
            title="Launch this"
            href={launchHref}
          >
            <Rocket className="size-3.5" />
          </ButtonLink>
          {onEdit && (
            <Button
              size="icon"
              variant="secondary"
              className="pointer-events-auto size-7"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onEdit();
              }}
            >
              <Pencil className="size-3.5" />
            </Button>
          )}
          <Button
            size="icon"
            variant="destructive"
            className="pointer-events-auto size-7"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onDelete();
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="truncate px-2 py-1.5 text-xs">
        <p className="truncate font-medium">{asset.title ?? asset.filename ?? "Untitled"}</p>
        <p className="text-muted-foreground">
          {asset.width && asset.height ? `${asset.width}×${asset.height}` : ""}
          {asset.size ? ` · ${formatBytes(asset.size)}` : ""}
        </p>
      </div>
    </div>
  );
}
