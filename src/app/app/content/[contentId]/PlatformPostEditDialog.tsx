"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  Images,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { useTRPC } from "@/trpc/react";
import { useMediaUpload } from "@/app/app/media/use-media-upload";
import { Button } from "@/components/ui/button";
import { Dropzone } from "@/components/ui/dropzone";
import { SimpleDialog } from "@/components/ui/dialog";
import { MediaThumbnail } from "@/components/media-thumbnail";
import { platformLabel } from "@/components/channel-logos";
import { toast } from "@/components/ui/toast";
import type { MediaItem } from "@/server/db/schema";
import { platformTextLength } from "@/lib/platform-thread";
import { isStoryFormat, sequenceNoun } from "@/lib/platform-sequence";
import { getPlatformFormat } from "@/server/content/formats";
import {
  CompactPlatformPreview,
  type CompactPreviewLinkCard,
} from "./CompactPlatformPreview";
import { MediaPickerDialog } from "./MediaPickerDialog";

export type PlatformThreadItemData = {
  id: string;
  updatedAtISO: string;
  text: string | null;
  media: MediaItem[] | null;
  assetLinks: string[] | null;
  sequence: number | null;
  scheduledAtISO?: string | null;
  deliveryExternalId?: string | null;
  deliveryStatus?: string | null;
  deliveryError?: string | null;
};

type EditorItem = {
  clientKey: string;
  id?: string;
  text: string;
  media: MediaItem[];
  assetLinks: string[];
  pendingLink: string;
};

const persistedSnapshot = (items: EditorItem[]) =>
  JSON.stringify(
    items.map(({ id, text, media, assetLinks }) => ({
      id,
      text,
      media,
      assetLinks,
    })),
  );

const makeClientKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `thread-item-${Date.now()}-${Math.random()}`;

export function PlatformPostEditDialog({
  platformPostId,
  updatedAtISO,
  brandId,
  platform,
  format,
  channelName,
  channelProfileImageUrl,
  channelBannerImageUrl,
  username,
  brandName,
  contentTitle,
  text,
  media,
  assetLinks,
  threadItems,
  linkCard,
  scheduled,
}: {
  platformPostId: string;
  updatedAtISO: string;
  brandId: string;
  platform: string;
  format: string | null;
  channelName: string | null;
  channelProfileImageUrl?: string | null;
  channelBannerImageUrl?: string | null;
  username: string | null;
  brandName: string;
  contentTitle: string;
  text: string | null;
  media: MediaItem[];
  assetLinks: string[];
  threadItems?: PlatformThreadItemData[];
  linkCard?: CompactPreviewLinkCard | null;
  scheduled: boolean;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const { uploadFiles, uploading } = useMediaUpload(brandId);
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerItemIndex, setPickerItemIndex] = useState(0);
  const [openedVersion, setOpenedVersion] = useState("");
  const [baseSnapshot, setBaseSnapshot] = useState("");
  const [items, setItems] = useState<EditorItem[]>([]);

  const save = useMutation(
    trpc.content.saveSpotThread.mutationOptions({
      onSuccess: (result) => {
        const label = isStoryFormat(format)
          ? `${platformLabel(platform)} Story`
          : result.itemIds.length > 1
            ? `${platformLabel(platform)} thread`
            : `${platformLabel(platform)} post`;
        toast.success(`${label} saved`);
        setOpen(false);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const story = isStoryFormat(format);
  const sequenceCapable =
    getPlatformFormat(format ?? "")?.sequence === true ||
    platform === "x" ||
    platform === "threads";
  const characterLimit =
    platform === "x" ? 280 : platform === "threads" ? 500 : null;
  const dirty = persistedSnapshot(items) !== baseSnapshot;
  const stale = open && openedVersion !== updatedAtISO;
  const invalid =
    items.length === 0 ||
    (!story && items.length > 1 && items.some((item) => !item.text.trim())) ||
    (story &&
      items.some(
        (item) =>
          item.media.length !== 1 ||
          !["image", "video"].includes(item.media[0]?.type ?? ""),
      )) ||
    (characterLimit !== null &&
      items.some(
        (item) => platformTextLength(item.text, platform) > characterLimit,
      ));

  const initialItems = () => {
    const source =
      threadItems?.length && threadItems.length > 0
        ? [...threadItems].sort(
            (a, b) =>
              (a.sequence ?? Number.MAX_SAFE_INTEGER) -
              (b.sequence ?? Number.MAX_SAFE_INTEGER),
          )
        : [
            {
              id: platformPostId,
              updatedAtISO,
              text,
              media,
              assetLinks,
              sequence: 0,
            },
          ];
    return source.map((item) => ({
      clientKey: item.id,
      id: item.id,
      text: item.text ?? "",
      media: [...(item.media ?? [])],
      assetLinks: [...(item.assetLinks ?? [])],
      pendingLink: "",
    }));
  };

  const beginEditing = () => {
    const next = initialItems();
    setItems(next);
    setBaseSnapshot(persistedSnapshot(next));
    setOpenedVersion(updatedAtISO);
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

  const updateItem = (
    index: number,
    update: (item: EditorItem) => EditorItem,
  ) =>
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? update(item) : item,
      ),
    );

  const setItemMedia = (index: number, next: MediaItem[]) => {
    const seen = new Set<string>();
    updateItem(index, (item) => ({
      ...item,
      media: next.filter((mediaItem) => {
        const key = mediaItem.assetId ?? mediaItem.url;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    }));
  };

  const addLink = (index: number) => {
    updateItem(index, (item) => {
      const value = item.pendingLink.trim();
      if (!value) return item;
      return {
        ...item,
        pendingLink: "",
        assetLinks: item.assetLinks.includes(value)
          ? item.assetLinks
          : [...item.assetLinks, value],
      };
    });
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setItems((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
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
        disabled={!dirty || invalid || uploading > 0}
        onClick={() =>
          save.mutate({
            rootPlatformPostId: platformPostId,
            // When chat has moved the post underneath an open editor, the
            // person typing wins. Send the version we are knowingly replacing
            // so the concurrency guard still catches a genuine race.
            expectedUpdatedAt: stale ? updatedAtISO : openedVersion,
            items: items.map((item) => ({
              id: item.id,
              text: item.text.trim() ? item.text : null,
              media: item.media,
              assetLinks: item.assetLinks,
            })),
          })
        }
      >
        Save {story ? "Story" : items.length > 1 ? "thread" : "post"}
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
        title={`Edit ${platformLabel(platform)} ${
          story ? "Story" : items.length > 1 ? "thread" : "post"
        }`}
        description={
          story
            ? "Each frame is one native 24-hour Story post with exactly one image or video. Frame notes stay internal and are not sent to the platform."
            : sequenceCapable
              ? "Each block is one native post. Together they publish as one ordered thread."
              : "Manual changes save together. The page preview always reflects the latest server version."
        }
        size="xl"
        scrollable
        footer={footer}
      >
        {stale && (
          <div className="mb-4 flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 space-y-2">
              <p>
                Chat changed this post while you had the editor open. Saving
                keeps what you have written here and replaces the chat version.
              </p>
              {text?.trim() && text.trim() !== items[0]?.text.trim() && (
                <details className="text-amber-200/80">
                  <summary className="cursor-pointer text-xs">
                    What chat wrote
                  </summary>
                  <p className="mt-1 text-xs whitespace-pre-wrap">
                    {text.trim()}
                  </p>
                </details>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 space-y-4">
            {items.map((item, index) => (
              <section
                key={item.clientKey}
                className="bg-background rounded-xl border p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="bg-muted flex size-6 items-center justify-center rounded-full text-[10px] font-semibold">
                    {index + 1}
                  </span>
                  <h3 className="min-w-0 flex-1 text-sm font-medium">
                    {story
                      ? `Story frame ${index + 1}`
                      : items.length > 1
                        ? index === 0
                          ? "Thread opener"
                          : `Reply ${index}`
                        : "Platform copy"}
                  </h3>
                  {characterLimit && (
                    <span
                      className={
                        platformTextLength(item.text, platform) > characterLimit
                          ? "text-destructive text-[11px]"
                          : "text-muted-foreground text-[11px]"
                      }
                    >
                      {platformTextLength(item.text, platform)}/{characterLimit}
                    </span>
                  )}
                  {items.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => moveItem(index, -1)}
                        disabled={index === 0}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                        aria-label="Move post up"
                      >
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(index, 1)}
                        disabled={index === items.length - 1}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                        aria-label="Move post down"
                      >
                        <ArrowDown className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setItems((current) =>
                            current.filter(
                              (candidate) =>
                                candidate.clientKey !== item.clientKey,
                            ),
                          )
                        }
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remove post from thread"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
                </div>

                <textarea
                  value={item.text}
                  onChange={(event) =>
                    updateItem(index, (current) => ({
                      ...current,
                      text: event.target.value,
                    }))
                  }
                  placeholder={
                    story
                      ? "Optional internal note. Story captions are not displayed."
                      : items.length > 1
                        ? index === 0
                          ? "Write the thread opener"
                          : "Write the next reply"
                        : "Write the platform-ready copy"
                  }
                  rows={story ? 3 : items.length > 1 ? 5 : 8}
                  className="focus:ring-ring/40 mt-3 w-full resize-y rounded-lg border px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2"
                />

                {item.media.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.media.map((mediaItem, mediaIndex) => (
                      <span
                        key={`${mediaItem.assetId ?? mediaItem.url}-${mediaIndex}`}
                        className="bg-muted group relative size-20 overflow-hidden rounded-lg border"
                      >
                        <MediaThumbnail
                          src={mediaItem.url}
                          thumbnail={mediaItem.thumbnail}
                          kind={mediaItem.type}
                          className="size-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setItemMedia(
                              index,
                              item.media.filter(
                                (_, candidateIndex) =>
                                  candidateIndex !== mediaIndex,
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

                <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Dropzone
                    compact
                    multiple={!story}
                    onFiles={async (files) => {
                      const uploaded = await uploadFiles(files);
                      if (uploaded.length) {
                        setItemMedia(
                          index,
                          story ? [uploaded[0]!] : [...item.media, ...uploaded],
                        );
                      }
                    }}
                    uploading={uploading}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPickerItemIndex(index);
                      setPickerOpen(true);
                    }}
                  >
                    <Images className="size-3.5" />
                    Library
                  </Button>
                </div>

                <details className="mt-3">
                  <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
                    Production links
                    {item.assetLinks.length
                      ? ` · ${item.assetLinks.length}`
                      : ""}
                  </summary>
                  {item.assetLinks.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {item.assetLinks.map((url, linkIndex) => (
                        <div
                          key={`${url}-${linkIndex}`}
                          className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs"
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
                              updateItem(index, (current) => ({
                                ...current,
                                assetLinks: current.assetLinks.filter(
                                  (_, candidateIndex) =>
                                    candidateIndex !== linkIndex,
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
                  <div className="mt-2 flex gap-2">
                    <input
                      value={item.pendingLink}
                      onChange={(event) =>
                        updateItem(index, (current) => ({
                          ...current,
                          pendingLink: event.target.value,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addLink(index);
                        }
                      }}
                      placeholder="Paste a Drive or asset link"
                      className="focus:ring-ring/40 min-w-0 flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => addLink(index)}
                      disabled={!item.pendingLink.trim()}
                    >
                      <Plus className="size-4" />
                      Add
                    </Button>
                  </div>
                </details>
              </section>
            ))}

            {sequenceCapable && items.length < 25 && (
              <button
                type="button"
                onClick={() =>
                  setItems((current) => [
                    ...current,
                    {
                      clientKey: makeClientKey(),
                      text: "",
                      media: [],
                      assetLinks: [],
                      pendingLink: "",
                    },
                  ])
                }
                className="border-border text-muted-foreground hover:text-foreground hover:bg-accent flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-3 text-sm font-medium transition-colors"
              >
                <Plus className="size-4" />
                Add another {sequenceNoun(format, 1)}
              </button>
            )}

            {save.isError && (
              <p className="text-destructive text-sm">{save.error.message}</p>
            )}
          </div>

          <CompactPlatformPreview
            className="mx-0 max-w-72"
            platform={platform}
            format={items.length > 1 ? `${platform}.thread` : format}
            channelName={channelName}
            channelProfileImageUrl={channelProfileImageUrl}
            channelBannerImageUrl={channelBannerImageUrl}
            username={username}
            brandName={brandName}
            contentTitle={contentTitle}
            text={items[0]?.text ?? ""}
            media={items[0]?.media ?? []}
            threadItems={items.map((item) => ({
              id: item.clientKey,
              text: item.text,
              media: item.media,
            }))}
            linkCard={linkCard}
            scheduled={scheduled}
          />
        </div>
      </SimpleDialog>

      <MediaPickerDialog
        brandId={brandId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        existingAssetIds={(items[pickerItemIndex]?.media ?? [])
          .map((item) => item.assetId)
          .filter((id): id is string => Boolean(id))}
        onPick={(item) =>
          setItemMedia(pickerItemIndex, [
            ...(story ? [] : (items[pickerItemIndex]?.media ?? [])),
            item,
          ])
        }
      />
    </>
  );
}
