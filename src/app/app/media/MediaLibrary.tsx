"use client";

import { useCallback, useDeferredValue, useRef, useState } from "react";
import Image from "next/image";
import {
  groupMediaExports,
  mediaExportProvenance,
} from "@/lib/media-export-bundles";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Accept } from "react-dropzone";
import {
  ExternalLink,
  Download,
  Film,
  FileText,
  FolderOpen,
  HardDrive,
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

import type { MediaKind } from "@/server/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Dropzone } from "@/components/ui/dropzone";
import {
  createImageThumbnail,
  createVideoThumbnail,
  THUMBNAIL_MIME,
} from "@/lib/image-thumbnail";
import { putWithProgress } from "@/lib/upload-with-progress";
import {
  formatUploadLimit,
  isStillMediaType,
  isVideoMediaType,
  maxUploadBytesFor,
  MEDIA_ACCEPT,
  MEDIA_TYPES_HINT,
  UPLOAD_CONCURRENCY,
} from "@/lib/media-accept";
import {
  captureVideoStoryboard,
  MAX_STORYBOARD_BOARDS,
  storyboardDescriptor,
  uploadStoryboardBoards,
} from "@/lib/video-artifacts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useTRPC, type RouterOutputs } from "@/trpc/react";
import { EditLinkDialog } from "./EditLinkDialog";
import { GoogleDriveImportDialog } from "./GoogleDriveImportDialog";
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
function assetLaunchHref(asset: LibraryAsset, brandId: string): string {
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

const ACCEPT: Accept = MEDIA_ACCEPT;

type Brand = {
  id: string;
  name: string;
  logo: string | null;
  slug: string | null;
};
type LibraryAsset = RouterOutputs["media"]["list"][number];

const KIND_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All media" },
  { value: "image", label: "Images" },
  { value: "video", label: "Video" },
  { value: "gif", label: "GIFs" },
];

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function MediaLibrary({
  brands,
  initialBrandId,
  initialFolderId,
}: {
  brands: Brand[];
  initialBrandId?: string | null;
  initialFolderId?: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [brandId, setBrandIdState] = useState(initialBrandId ?? brands[0]!.id);
  // Keep ?brand= in the URL so the current library is always linkable.
  const setBrandId = (id: string) => {
    setBrandIdState(id);
    setFolderFilter("all");
    const brand = brands.find((row) => row.id === id);
    const url = new URL(window.location.href);
    url.searchParams.set("brand", brand?.slug ?? id);
    url.searchParams.delete("folder");
    window.history.replaceState(null, "", url);
  };
  const [filter, setFilter] = useState<string>("all");
  const [folderFilter, setFolderFilter] = useState(initialFolderId ?? "all");
  const [tagFilter, setTagFilter] = useState("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [organizingAsset, setOrganizingAsset] = useState<LibraryAsset | null>(
    null,
  );
  const [previewAsset, setPreviewAsset] = useState<LibraryAsset | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  // Per-file progress. A count alone cannot distinguish "still going" from
  // "stuck", which is exactly the doubt a big video upload creates.
  const [uploads, setUploads] = useState<
    { key: string; name: string; size: number; fraction: number }[]
  >([]);
  // Assigned by the Dropzone so the header "Upload" button opens the same picker.
  const openPicker = useRef<(() => void) | null>(null);

  // "Add link" (external asset) dialog state.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkKind, setLinkKind] = useState<MediaKind>("video");
  const linkThumb = usePhotoPicker();

  // "Edit link" dialog — the asset currently being edited.
  const [editingAsset, setEditingAsset] = useState<LibraryAsset | null>(null);

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
  const failUpload = useMutation(trpc.media.failUpload.mutationOptions());
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
        toast.success("Analyzed and tagged");
        void invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  // --- upload one file directly to R2 via a presigned PUT ---
  const uploadFile = useCallback(
    async (file: File) => {
      const isImage = isStillMediaType(file.type);
      const isVideo = isVideoMediaType(file.type);
      const maximumBytes = maxUploadBytesFor(file.type);
      if (!maximumBytes) {
        toast.error(`${file.name}: use ${MEDIA_TYPES_HINT}`);
        return;
      }
      // Checked before the decode: the server refuses anything over the video
      // ceiling too, and finding that out after a minute of poster-cutting is
      // a zod error message nobody can act on.
      if (file.size > maximumBytes) {
        toast.error(`${file.name} exceeds ${formatUploadLimit(maximumBytes)}`);
        return;
      }

      const uploadKey = `${file.name}-${file.size}-${file.lastModified}`;
      let pendingMediaId: string | null = null;
      setUploadingCount((c) => c + 1);
      setUploads((current) => [
        ...current,
        { key: uploadKey, name: file.name, size: file.size, fraction: 0 },
      ]);
      try {
        // Images decode once for both dimensions and a downscaled grid tile;
        // video seeks once for a poster frame. Both degrade to null rather
        // than blocking the upload.
        const decoded = isImage
          ? await createImageThumbnail(file)
          : await createVideoThumbnail(file);
        const created = await createUploadUrl.mutateAsync({
          brandId,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          // Slots for every board we might cut; presigning is free.
          boardCount: isVideo ? MAX_STORYBOARD_BOARDS : 0,
        });
        pendingMediaId = created.mediaId;
        const {
          mediaId,
          uploadUrl,
          publicUrl,
          pathname,
          thumbnailUploadUrl,
          boardUploads,
        } = created;
        // The storyboard is what makes the clip analyzable later, from
        // anywhere, and the browser is the only place it can be cut. It runs
        // alongside the PUT so a long clip is not stuck at 0% while frames
        // are sampled.
        const [, storyboard] = await Promise.all([
          putWithProgress(uploadUrl, file, {
            contentType: file.type,
            onProgress: (fraction) =>
              setUploads((current) =>
                current.map((upload) =>
                  upload.key === uploadKey ? { ...upload, fraction } : upload,
                ),
              ),
          }),
          isVideo ? captureVideoStoryboard(file) : Promise.resolve(null),
        ]);

        // Best-effort — a missing tile only means the grid uses the original.
        let hasThumbnail = false;
        if (decoded?.thumbnail && thumbnailUploadUrl) {
          const putThumbnail = await putWithProgress(
            thumbnailUploadUrl,
            decoded.thumbnail,
            { contentType: THUMBNAIL_MIME },
          ).then(
            () => true,
            () => false,
          );
          hasThumbnail = putThumbnail;
        }

        const landed = storyboard
          ? await uploadStoryboardBoards(
              storyboard,
              (index) =>
                boardUploads.find((slot) => slot.index === index)?.uploadUrl,
            )
          : new Set<number>();
        const descriptor = storyboard
          ? storyboardDescriptor(storyboard, landed)
          : null;

        await finalizeUpload.mutateAsync({
          mediaId,
          url: publicUrl,
          pathname,
          width: decoded?.sourceWidth || undefined,
          height: decoded?.sourceHeight || undefined,
          hasThumbnail,
          ...(descriptor ? { storyboard: descriptor } : {}),
        });
        pendingMediaId = null;
        toast.success(`Uploaded ${file.name}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        // Without this the row sits on `uploading` forever, because the only
        // writer that would have moved it is the finalize that never ran.
        if (pendingMediaId) {
          await failUpload
            .mutateAsync({ mediaId: pendingMediaId, reason: message })
            .catch(() => undefined);
        }
        toast.error(message);
      } finally {
        setUploadingCount((c) => c - 1);
        setUploads((current) =>
          current.filter((upload) => upload.key !== uploadKey),
        );
        void invalidate();
      }
    },
    [brandId, createUploadUrl, failUpload, finalizeUpload, invalidate],
  );

  const handleFiles = useCallback(
    async (files: File[] | FileList | null) => {
      if (!files?.length) return;
      // Bounded, because "choose a folder" routinely means a hundred files and
      // a hundred simultaneous decodes, presigns and PUTs starves the browser
      // of connections and reads as a hang.
      const queue = Array.from(files);
      let cursor = 0;
      const worker = async () => {
        while (cursor < queue.length) await uploadFile(queue[cursor++]!);
      };
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, () =>
          worker(),
        ),
      );
    },
    [uploadFile],
  );

  const renderAsset = (asset: LibraryAsset) => (
    <MediaCard
      key={asset.id}
      asset={asset}
      onDelete={() => deleteMedia.mutate({ id: asset.id })}
      onEdit={
        asset.provider === "external" ? () => setEditingAsset(asset) : undefined
      }
      onOrganize={() => setOrganizingAsset(asset)}
      onPreview={() => setPreviewAsset(asset)}
      onAnalyze={
        asset.kind === "image" || asset.kind === "video"
          ? () => analyzeMedia.mutate({ id: asset.id })
          : undefined
      }
      analyzing={
        analyzeMedia.isPending && analyzeMedia.variables?.id === asset.id
      }
      launchHref={assetLaunchHref(asset, brandId)}
    />
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Media</h1>
          <p className="text-sm text-muted-foreground">
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
            onClick={() => setDriveOpen(true)}
          >
            <HardDrive className="size-4" />
            Drive
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
            onClick={() => openPicker.current?.()}
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
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search media or tags"
            leading="search"
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
            <p className="text-xs text-muted-foreground">
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

      {/* Dropzone — accepts loose files, a whole folder, or a drag of either. */}
      <Dropzone
        accept={ACCEPT}
        uploading={uploadingCount}
        progress={uploads}
        openRef={openPicker}
        onFiles={(files) => void handleFiles(files)}
        title="Drop images or video here"
        hint="JPEG · PNG · WebP · GIF (≤25MB) · MP4 · WebM · MOV"
      />

      {/* Grid */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (assets ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No media yet. Upload your first asset above.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {groupMediaExports(assets ?? []).map((entry) =>
            entry.approval ? (
              <ExportBundle
                key={entry.key}
                assets={entry.assets}
                approval={entry.approval}
                renderAsset={renderAsset}
              />
            ) : (
              renderAsset(entry.assets[0]!)
            ),
          )}
        </div>
      )}

      <GoogleDriveImportDialog
        brandId={brandId}
        open={driveOpen}
        onOpenChange={setDriveOpen}
        onImported={() => invalidate()}
      />

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
          brands={brands}
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
    <div className="group relative overflow-hidden rounded-lg border bg-muted/30">
      <div
        className="relative aspect-square cursor-zoom-in bg-muted"
        title="View full screen"
        onClick={onPreview}
      >
        {asset.status === "processing" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            Processing…
          </div>
        ) : isExternal ? (
          <a
            href={externalHref ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="group/link absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
            onClick={(event) => event.stopPropagation()}
          >
            {preview ? (
              <>
                {/* oxlint-disable-next-line nextjs/no-img-element */}
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
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <KindIcon className="size-6" />
          </div>
        )}

        <Badge
          variant="outline"
          textSize="caption"
          tone="media"
          className="absolute top-1.5 left-1.5"
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
          tone="media"
          className="absolute top-1.5 right-1.5 z-10 size-7"
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
            tone="media"
            className="absolute top-1.5 right-10 z-10 size-7"
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
              title="Analyze and tag"
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
              <Badge variant="outline" textSize="micro" className="h-4">
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
                  textSize="micro"
                  className="h-4"
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

function ExportBundle({
  assets,
  approval,
  renderAsset,
}: {
  assets: LibraryAsset[];
  approval: NonNullable<ReturnType<typeof mediaExportProvenance>>;
  renderAsset: (asset: LibraryAsset) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const shapes = [
    ...new Set(
      assets.map((asset) => mediaExportProvenance(asset.metadata)!.shape),
    ),
  ];
  const cover =
    assets.find(
      (asset) => mediaExportProvenance(asset.metadata)?.shape === "portrait",
    ) ?? assets[0]!;
  const title = approval.adName ?? cover.title?.split(" · ")[0] ?? "Ad exports";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="overflow-hidden rounded-lg border bg-muted/30 text-left"
      >
        <div className="relative aspect-square bg-muted">
          {cover.url && (
            <Image
              src={cover.url}
              alt={title}
              fill
              sizes="240px"
              className="object-cover"
            />
          )}
          <span className="absolute bottom-2 left-2 rounded bg-background px-2 py-1 text-xs">
            {assets.length} exports · {shapes.length}{" "}
            {shapes.length === 1 ? "size" : "sizes"}
          </span>
        </div>
        <div className="space-y-1 p-3">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {approval.campaignName ?? "Ad approval"}
          </p>
          <p className="text-xs text-muted-foreground">Open slides & sizes</p>
        </div>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{title} · exports</DialogTitle>
            <DialogDescription>
              {approval.campaignName ?? "Ad approval"} · {assets.length}{" "}
              matching images
            </DialogDescription>
          </DialogHeader>
          {shapes.map((shape) => (
            <section key={shape} className="space-y-3">
              <h3 className="text-sm font-medium capitalize">{shape}</h3>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {assets
                  .filter(
                    (asset) =>
                      mediaExportProvenance(asset.metadata)?.shape === shape,
                  )
                  .sort((a, b) =>
                    (a.title ?? a.filename ?? a.id).localeCompare(
                      b.title ?? b.filename ?? b.id,
                      undefined,
                      { numeric: true },
                    ),
                  )
                  .map(renderAsset)}
              </div>
            </section>
          ))}
        </DialogContent>
      </Dialog>
    </>
  );
}
