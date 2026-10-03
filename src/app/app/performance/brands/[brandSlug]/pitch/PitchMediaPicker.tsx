"use client";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";
import { SimpleDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WebsiteMediaSuggestions } from "@/app/app/media/WebsiteMediaSuggestions";
export type PitchAssetTarget = "photos" | "hero" | "logo" | "icon";
export function PitchMediaPicker({
  brandId,
  target,
  selected,
  onClose,
  onSave,
}: {
  brandId: string;
  target: PitchAssetTarget;
  selected: string[];
  onClose: () => void;
  onSave: (urls: string[]) => Promise<void>;
}) {
  const [urls, setUrls] = useState(selected);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assets = useQuery(
    orpc.media.list.queryOptions({
      input: { brandId, kind: "image", query: search },
    }),
  );
  const create = useMutation(orpc.media.createUploadUrl.mutationOptions());
  const finalize = useMutation(orpc.media.finalizeUpload.mutationOptions());
  const fail = useMutation(orpc.media.failUpload.mutationOptions());
  const createFolder = useMutation(orpc.media.createFolder.mutationOptions());
  const organize = useMutation(orpc.media.updateMeta.mutationOptions());
  const taxonomy = useQuery({
    ...orpc.media.taxonomy.queryOptions({ input: { brandId } }),
    enabled: false,
  });
  const apply = async (next: string[]) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the pitch");
    } finally {
      setBusy(false);
    }
  };
  const choose = async (url: string) => {
    if (target !== "photos") return apply([url]);
    setUrls((current) =>
      current.includes(url)
        ? current.filter((item) => item !== url)
        : current.length < 3
          ? [...current, url]
          : current,
    );
  };
  const upload = async (file: File) => {
    if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) {
      setError("Choose an image under 20 MB.");
      return;
    }
    setBusy(true);
    setError(null);
    let id: string | undefined;
    let finished = false;
    try {
      const slot = await create.mutateAsync({
        brandId,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
      });
      id = slot.mediaId;
      const response = await fetch(slot.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("Image upload failed");
      await finalize.mutateAsync({
        mediaId: id,
        url: slot.publicUrl,
        pathname: slot.pathname,
      });
      finished = true;
      const folders = await taxonomy.refetch();
      let folder = folders.data?.folders.find((item) => item.name === "Pitch");
      if (!folder) {
        try {
          folder = await createFolder.mutateAsync({ brandId, name: "Pitch" });
        } catch {
          folder = (await taxonomy.refetch()).data?.folders.find(
            (item) => item.name === "Pitch",
          );
        }
      }
      if (folder) await organize.mutateAsync({ id, folderId: folder.id });
      await assets.refetch();
      await choose(slot.publicUrl);
    } catch (e) {
      if (id && !finished)
        await fail
          .mutateAsync({ mediaId: id, reason: "Pitch upload failed" })
          .catch(() => undefined);
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };
  const title =
    target === "photos"
      ? "Choose featured photos"
      : `Choose ${target === "hero" ? "hero background" : target}`;
  return (
    <SimpleDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={title}
      description={
        target === "photos"
          ? "Select up to three approved images, then save to the live pitch."
          : "Selecting an approved image saves it directly to the live pitch."
      }
      size="xl"
      scrollable
    >
      <div className="space-y-4">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Input
            aria-label="Search approved images"
            placeholder="Search approved images…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Label>
            Upload image
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy || (target === "photos" && urls.length >= 3)}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
            />
          </Label>
        </div>
        {target === "photos" && (
          <p className="text-xs text-muted-foreground">
            {urls.length} of 3 selected
          </p>
        )}
        {assets.isError ? (
          <p role="alert">
            Could not load the library.{" "}
            <button className="underline" onClick={() => void assets.refetch()}>
              Retry
            </button>
          </p>
        ) : assets.isLoading ? (
          <p>Loading images…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 @lg:grid-cols-3">
            {assets.data
              ?.filter((a) => a.url)
              .map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  aria-label={`Select ${asset.title ?? asset.filename ?? "image"}`}
                  aria-pressed={urls.includes(asset.url!)}
                  disabled={
                    busy ||
                    (target === "photos" &&
                      urls.length >= 3 &&
                      !urls.includes(asset.url!))
                  }
                  onClick={() => void choose(asset.url!)}
                  className={`overflow-hidden rounded-lg border text-left disabled:opacity-50 ${urls.includes(asset.url!) ? "ring-2 ring-ring" : ""}`}
                >
                  <img
                    src={asset.thumbnailUrl ?? asset.url!}
                    alt={asset.title ?? "Library image"}
                    className="aspect-video w-full object-cover"
                    loading="lazy"
                  />
                  <p className="truncate p-2 text-xs">
                    {asset.title ?? asset.filename ?? "Image"}
                  </p>
                </button>
              ))}
          </div>
        )}
        {!assets.isLoading && !assets.data?.length && (
          <p className="text-sm text-muted-foreground">
            No approved images yet. Upload one or review website suggestions
            below.
          </p>
        )}
        <WebsiteMediaSuggestions
          brandId={brandId}
          disabled={busy || (target === "photos" && urls.length >= 3)}
          onUse={choose}
          useLabel={target === "photos" ? "Select for pitch" : "Use in pitch"}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void apply([])}
          >
            Use {target === "photos" ? "automatic photos" : "default"}
          </Button>
          {target === "photos" && (
            <Button disabled={busy} onClick={() => void apply(urls)}>
              {busy ? "Saving…" : "Save photos"}
            </Button>
          )}
        </div>
      </div>
    </SimpleDialog>
  );
}
