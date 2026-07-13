"use client";

import { useCallback, useDeferredValue, useRef, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  Download,
  Film,
  FileText,
  FolderOpen,
  ImageIcon,
  Link2,
  Loader2,
  Maximize2,
  Pencil,
  Rocket,
  Search,
  Settings2,
  Sparkles,
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
import { useTRPC, type RouterOutputs } from "@/trpc/react";
import { EditLinkDialog } from "./EditLinkDialog";
import { PhotoPickerField, usePhotoPicker } from "../people/PhotoPicker";
import { MediaTaxonomyDialog } from "./MediaTaxonomyDialog";
import { OrganizeMediaDialog } from "./OrganizeMediaDialog";
import { MediaLightbox } from "./MediaLightbox";
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
  const params = new URLSearchParams({
    brandId: opts.brandId,
    name: opts.title,
    prompt: ref,
  });
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
    imageUrl: isExternal
      ? null
      : asset.kind === "image"
        ? asset.url
        : asset.thumbnailUrl,
    kind: asset.kind,
    sourceProvider: isExternal ? (asset.sourceProvider ?? "link") : null,
  });
}

const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES].join(",");
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

type Brand = { id: string; name: string; logo: string | null };
type LibraryAsset = RouterOutputs["media"]["list"][number];

const KIND_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All media" },
  { value: "image", label: "Images" },
  { value: "video", label: "Video" },
  { value: "gif", label: "GIFs" },
];

function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
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
  const [folderFilter, setFolderFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);
  const [organizingAsset, setOrganizingAsset] = useState<LibraryAsset | null>(
    null,
  );
  const [previewAsset, setPreviewAsset] = useState<LibraryAsset | null>(null);
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
    ...(folderFilter === "unfiled"
      ? { folderId: null }
      : folderFilter !== "all"
        ? { folderId: folderFilter }
        : {}),
    ...(tagFilter !== "all" ? { tagId: tagFilter } : {}),
    ...(deferredSearch.trim() ? { query: deferredSearch.trim() } : {}),
  };
  const listOpts = trpc.media.list.queryOptions(listInput);
  const { data: assets, isLoading } = useQuery(listOpts);
  const taxonomyOpts = trpc.media.taxonomy.queryOptions({ brandId });
  const { data: taxonomy } = useQuery(taxonomyOpts);

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: listOpts.queryKey }),
    [queryClient, listOpts.queryKey],
  );

  const createUploadUrl = useMutation(
    trpc.media.createUploadUrl.mutationOptions(),
  );
  const finalizeUpload = useMutation(
    trpc.media.finalizeUpload.mutationOptions(),
  );
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
  const analyzeMedia = useMutation(
    trpc.media.analyze.mutationOptions({
      onSuccess: () => {
        toast.success("Image analyzed");
        void invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  // --- upload one file directly to R2 via a presigned PUT ---
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
        const dims = isImage ? await readImageDimensions(file) : undefined;
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
          width: dims?.width || undefined,
          height: dims?.height || undefined,
        });
        toast.success(`Uploaded ${file.name}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploadingCount((c) => c - 1);
        void invalidate();
      }
    },
    [brandId, createUploadUrl, finalizeUpload, invalidate],
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      await Promise.all(Array.from(files).map((f) => uploadFile(f)));
    },
    [uploadFile],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Media</h1>
          <p className="text-muted-foreground text-sm">
            Reusable creative for Studio, stored in Cloudflare R2
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SimpleSelect
            value={brandId}
            onValueChange={(nextBrandId) => {
              setBrandId(nextBrandId);
              setFolderFilter("all");
              setTagFilter("all");
            }}
            options={brands.map((b) => ({ value: b.id, label: b.name }))}
            aria-label="Brand"
            size="sm"
          />
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
            variant="outline"
            size="sm"
            onClick={() => setTaxonomyOpen(true)}
          >
            <Settings2 className="size-4" />
            Organize
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

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search media or tags"
            className="pl-9"
          />
        </div>
        <SimpleSelect
          value={folderFilter}
          onValueChange={setFolderFilter}
          options={[
            { value: "all", label: "All folders" },
            { value: "unfiled", label: "Unfiled" },
            ...(taxonomy?.folders ?? []).map((folder) => ({
              value: folder.id,
              label: folder.name,
            })),
          ]}
          aria-label="Folder"
          size="sm"
        />
        <SimpleSelect
          value={tagFilter}
          onValueChange={setTagFilter}
          options={[
            { value: "all", label: "All tags" },
            ...(taxonomy?.tags ?? []).map((tag) => ({
              value: tag.id,
              label: tag.name,
            })),
          ]}
          aria-label="Tag"
          size="sm"
        />
      </div>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent onPaste={linkThumb.handlePaste}>
          <DialogHeader>
            <DialogTitle>Link an external file</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <p className="text-muted-foreground text-xs">
              Reference a file we don&apos;t host — a Google Drive / Dropbox /
              Frame.io master (e.g. a heavy working video). Cut-downs you
              publish get hosted separately and can link back to this as their
              source.
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
        <p className="text-sm font-medium">
          Drop images or video, or click to browse
        </p>
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
              onOrganize={() => setOrganizingAsset(asset)}
              onPreview={() => setPreviewAsset(asset)}
              onAnalyze={
                asset.kind === "image"
                  ? () => analyzeMedia.mutate({ id: asset.id })
                  : undefined
              }
              analyzing={
                analyzeMedia.isPending &&
                analyzeMedia.variables?.id === asset.id
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
      <MediaTaxonomyDialog
        brandId={brandId}
        open={taxonomyOpen}
        onOpenChange={setTaxonomyOpen}
      />
      {organizingAsset && taxonomy && (
        <OrganizeMediaDialog
          key={organizingAsset.id}
          asset={organizingAsset}
          taxonomy={taxonomy}
          open
          onOpenChange={(open) => !open && setOrganizingAsset(null)}
        />
      )}
      {previewAsset && (
        <MediaLightbox
          key={previewAsset.id}
          asset={previewAsset}
          open
          onOpenChange={(open) => !open && setPreviewAsset(null)}
        />
      )}
    </div>
  );
}

function MediaCard({
  asset,
  onDelete,
  onEdit,
  onOrganize,
  onPreview,
  onAnalyze,
  analyzing,
  launchHref,
}: {
  asset: LibraryAsset;
  onDelete: () => void;
  onEdit?: () => void;
  onOrganize: () => void;
  onPreview: () => void;
  onAnalyze?: () => void;
  analyzing: boolean;
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
      <div
        className="bg-muted relative aspect-square cursor-zoom-in"
        title="View full screen"
        onClick={onPreview}
      >
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
            onClick={(event) => event.stopPropagation()}
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
          <Image
            src={preview}
            alt={asset.alt ?? asset.filename ?? ""}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
            className="object-cover"
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
          {isExternal ? (
            <Link2 className="size-3" />
          ) : (
            <KindIcon className="size-3" />
          )}
          {isExternal ? (asset.sourceProvider ?? "link") : asset.kind}
        </Badge>
        <Button
          variant="secondary"
          size="icon"
          className="absolute top-1.5 right-1.5 z-10 size-7 bg-black/55 text-white backdrop-blur hover:bg-black/75"
          title="View full screen"
          onClick={(event) => {
            event.stopPropagation();
            onPreview();
          }}
        >
          <Maximize2 className="size-3.5" />
        </Button>
        {asset.provider === "r2" && asset.url && (
          <ButtonLink
            variant="secondary"
            size="icon"
            className="absolute top-1.5 right-10 z-10 size-7 bg-black/55 text-white backdrop-blur hover:bg-black/75"
            title="Download original"
            href={`/api/media/${asset.id}/download`}
            onClick={(event) => event.stopPropagation()}
          >
            <Download className="size-3.5" />
          </ButtonLink>
        )}

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
          {onAnalyze && (
            <Button
              size="icon"
              variant="secondary"
              className="pointer-events-auto size-7"
              title="Analyze image"
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                onAnalyze();
              }}
              disabled={analyzing}
            >
              {analyzing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
            </Button>
          )}
          <Button
            size="icon"
            variant="secondary"
            className="pointer-events-auto size-7"
            title="Organize media"
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              onOrganize();
            }}
          >
            <FolderOpen className="size-3.5" />
          </Button>
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
        <p className="truncate font-medium">
          {asset.title ?? asset.filename ?? "Untitled"}
        </p>
        <p className="text-muted-foreground">
          {asset.width && asset.height ? `${asset.width}×${asset.height}` : ""}
          {asset.size ? ` · ${formatBytes(asset.size)}` : ""}
        </p>
        {(asset.folder || asset.tagAssignments.length > 0) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {asset.folder && (
              <Badge variant="outline" className="h-4 px-1 text-[9px]">
                {asset.folder.name}
              </Badge>
            )}
            {Array.from(
              new Map(
                asset.tagAssignments.map((assignment) => [
                  assignment.tagId,
                  assignment.tag,
                ]),
              ).values(),
            )
              .slice(0, 2)
              .map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="h-4 px-1 text-[9px]"
                >
                  {tag.name}
                </Badge>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
