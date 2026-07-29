"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { CircleAlert, Images, Pencil, Plus, X } from "lucide-react";

import { useTRPC } from "@/trpc/react";
import { useMediaUpload } from "@/app/app/media/use-media-upload";
import { Button } from "@/components/ui/button";
import { Dropzone } from "@/components/ui/dropzone";
import { SimpleDialog } from "@/components/ui/dialog";
import { MediaThumbnail } from "@/components/media-thumbnail";
import { platformLabel } from "@/components/channel-logos";
import { toast } from "@/components/ui/toast";
import type { MediaItem } from "@/server/db/schema";
import {
  CompactPlatformPreview,
  type CompactPreviewLinkCard,
} from "./CompactPlatformPreview";
import { MediaPickerDialog } from "./MediaPickerDialog";

type EditorDraft = {
  text: string;
  media: MediaItem[];
  assetLinks: string[];
};

const snapshot = (draft: EditorDraft) => JSON.stringify(draft);

export function PlatformPostEditDialog({
  platformPostId,
  updatedAtISO,
  brandId,
  platform,
  format,
  channelName,
  username,
  brandName,
  contentTitle,
  text,
  media,
  assetLinks,
  linkCard,
  scheduled,
}: {
  platformPostId: string;
  updatedAtISO: string;
  brandId: string;
  platform: string;
  format: string | null;
  channelName: string | null;
  username: string | null;
  brandName: string;
  contentTitle: string;
  text: string | null;
  media: MediaItem[];
  assetLinks: string[];
  linkCard?: CompactPreviewLinkCard | null;
  scheduled: boolean;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const { uploadImages, uploading } = useMediaUpload(brandId);
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openedVersion, setOpenedVersion] = useState("");
  const [baseSnapshot, setBaseSnapshot] = useState("");
  const [draft, setDraft] = useState<EditorDraft>({
    text: "",
    media: [],
    assetLinks: [],
  });
  const [linkValue, setLinkValue] = useState("");

  const save = useMutation(
    trpc.content.saveSpotEditor.mutationOptions({
      onSuccess: () => {
        toast.success(`${platformLabel(platform)} post saved`);
        setOpen(false);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const dirty = snapshot(draft) !== baseSnapshot;
  const stale = open && openedVersion !== updatedAtISO;

  const beginEditing = () => {
    const next = {
      text: text ?? "",
      media: [...media],
      assetLinks: [...assetLinks],
    };
    setDraft(next);
    setBaseSnapshot(snapshot(next));
    setOpenedVersion(updatedAtISO);
    setLinkValue("");
    save.reset();
    setOpen(true);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) {
      beginEditing();
      return;
    }
    if (
      dirty &&
      !save.isPending &&
      !window.confirm("Discard your unsaved post changes?")
    ) {
      return;
    }
    setOpen(false);
  };

  const setMedia = (next: MediaItem[]) => {
    const seen = new Set<string>();
    setDraft((current) => ({
      ...current,
      media: next.filter((item) => {
        const key = item.assetId ?? item.url;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    }));
  };

  const addLink = () => {
    const value = linkValue.trim();
    if (!value) return;
    setDraft((current) => ({
      ...current,
      assetLinks: current.assetLinks.includes(value)
        ? current.assetLinks
        : [...current.assetLinks, value],
    }));
    setLinkValue("");
  };

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => handleOpenChange(false)}
      >
        Cancel
      </Button>
      <Button
        type="button"
        loading={save.isPending}
        disabled={!dirty || stale || uploading > 0}
        onClick={() =>
          save.mutate({
            platformPostId,
            expectedUpdatedAt: openedVersion,
            text: draft.text.trim() ? draft.text : null,
            media: draft.media,
            assetLinks: draft.assetLinks,
          })
        }
      >
        Save post
      </Button>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={beginEditing}
        className="border-border text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors"
      >
        <Pencil className="size-3.5" />
        Edit
      </button>

      <SimpleDialog
        open={open}
        onOpenChange={handleOpenChange}
        title={`Edit ${platformLabel(platform)} post`}
        description="Manual changes save together. The page preview always reflects the latest server version."
        size="xl"
        scrollable
        footer={footer}
      >
        {stale && (
          <div className="mb-4 flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              This post changed in chat while the editor was open. Close and
              reopen the editor to load the latest version. Your draft has not
              been overwritten.
            </p>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 space-y-5">
            <label className="block">
              <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                Platform copy
              </span>
              <textarea
                value={draft.text}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    text: event.target.value,
                  }))
                }
                placeholder="Write the platform-ready copy"
                rows={9}
                className="bg-background focus:ring-ring/40 mt-1.5 w-full resize-y rounded-lg border px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2"
              />
            </label>

            <section>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">Media</h3>
                  <p className="text-muted-foreground text-xs">
                    Uploads are also saved to the brand library.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                >
                  <Images className="size-3.5" />
                  Library
                </Button>
              </div>

              {draft.media.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {draft.media.map((item, index) => (
                    <span
                      key={`${item.assetId ?? item.url}-${index}`}
                      className="bg-muted group relative size-20 overflow-hidden rounded-lg border"
                    >
                      <MediaThumbnail
                        src={item.url}
                        thumbnail={item.thumbnail}
                        className="size-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setMedia(
                            draft.media.filter(
                              (_, mediaIndex) => mediaIndex !== index,
                            ),
                          )
                        }
                        className="absolute top-1 right-1 rounded bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                        aria-label="Remove asset"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <Dropzone
                compact
                multiple
                onFiles={async (files) => {
                  const items = await uploadImages(files);
                  if (items.length) setMedia([...draft.media, ...items]);
                }}
                uploading={uploading}
                className="mt-3"
              />
            </section>

            <section>
              <h3 className="text-sm font-medium">External asset links</h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Keep Drive folders or other production references with this
                post.
              </p>
              {draft.assetLinks.length > 0 && (
                <div className="mt-3 space-y-2">
                  {draft.assetLinks.map((url, index) => (
                    <div
                      key={`${url}-${index}`}
                      className="bg-background flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs"
                    >
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 truncate underline underline-offset-2"
                      >
                        {url}
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            assetLinks: current.assetLinks.filter(
                              (_, linkIndex) => linkIndex !== index,
                            ),
                          }))
                        }
                        aria-label="Remove link"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <input
                  value={linkValue}
                  onChange={(event) => setLinkValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addLink();
                    }
                  }}
                  placeholder="Paste a Drive or asset link"
                  className="bg-background focus:ring-ring/40 min-w-0 flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addLink}
                  disabled={!linkValue.trim()}
                >
                  <Plus className="size-4" />
                  Add
                </Button>
              </div>
            </section>

            {save.isError && (
              <p className="text-destructive text-sm">{save.error.message}</p>
            )}
          </div>

          <CompactPlatformPreview
            className="mx-0 max-w-72"
            platform={platform}
            format={format}
            channelName={channelName}
            username={username}
            brandName={brandName}
            contentTitle={contentTitle}
            text={draft.text}
            media={draft.media}
            linkCard={linkCard}
            scheduled={scheduled}
          />
        </div>
      </SimpleDialog>

      <MediaPickerDialog
        brandId={brandId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        existingAssetIds={draft.media
          .map((item) => item.assetId)
          .filter((id): id is string => Boolean(id))}
        onPick={(item) => setMedia([...draft.media, item])}
      />
    </>
  );
}
