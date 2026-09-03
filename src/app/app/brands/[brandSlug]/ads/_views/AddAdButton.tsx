"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ImagePlus, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MediaPickerDialog } from "@/app/app/content/[contentId]/MediaPickerDialog";
import type { MediaItem } from "@/server/db/schema";
import { useTRPC } from "@/trpc/react";
import { posterForMedia } from "@/lib/media-url";

/**
 * Draft an ad onto a draft campaign. The creative comes from the brand's
 * media library — the same pool the studio and compositions publish into —
 * so anything made anywhere in growth is one picker away from being an ad.
 */
export function AddAdButton({
  campaignId,
  brandId,
  inheritedLinkUrl,
}: {
  campaignId: string;
  brandId: string;
  /** The campaign's landing URL; ads only set their own to override it. */
  inheritedLinkUrl?: string | null;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  // One image = static, several = carousel cards in order, one video = video
  // ad. A video stands alone: picking it replaces the list.
  const [media, setMedia] = useState<MediaItem[]>([]);

  const add = useMutation(
    trpc.ads.addDraftAd.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        setName("");
        setBody("");
        setMedia([]);
        router.refresh();
      },
    }),
  );

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Plus className="size-3.5" />
            Add ad
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Draft an ad</DialogTitle>
            <DialogDescription>
              Stays local until the draft is pushed to a platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex shrink-0 flex-col gap-1.5">
                <div className="flex max-w-48 flex-wrap gap-1.5">
                  {media.map((item, index) => (
                    <div
                      key={`${item.assetId ?? item.url}-${index}`}
                      className="bg-muted relative h-14 w-14 overflow-hidden rounded-md border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={posterForMedia(item)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      {item.type === "video" && (
                        <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[9px] font-medium text-white">
                          video
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setMedia((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                        className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black"
                      >
                        <X className="size-2.5" />
                      </button>
                    </div>
                  ))}
                  {media[0]?.type !== "video" && media.length < 10 && (
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="bg-muted text-muted-foreground flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-md border text-[9px] hover:border-white/25"
                    >
                      <ImagePlus className="size-3.5" />
                      {media.length === 0 ? "Library" : "Add"}
                    </button>
                  )}
                </div>
                <p className="text-muted-foreground max-w-48 text-[10px]">
                  {media[0]?.type === "video"
                    ? "Video ad — one clip, needs a thumbnail."
                    : media.length > 1
                      ? `Carousel — ${media.length} cards, in this order.`
                      : "One image = static. Add more for a carousel, or pick a video."}
                </p>
              </div>
              <div className="flex-1 space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="ad-name">Name</Label>
                  <Input
                    id="ad-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="PropertyA_Static_Wander Pawleys Island"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ad-link">
                    Link URL{" "}
                    <span className="text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </Label>
                  <Input
                    id="ad-link"
                    value={linkUrl}
                    onChange={(event) => setLinkUrl(event.target.value)}
                    placeholder={
                      inheritedLinkUrl
                        ? `Inherits ${inheritedLinkUrl}`
                        : "https://…"
                    }
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ad-body">Primary text</Label>
              <Textarea
                id="ad-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={3}
                placeholder="The copy shown above the creative."
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Creatives come from the brand&apos;s{" "}
              <Link href="/app/media" className="underline">
                media library
              </Link>{" "}
              — if it&apos;s empty, upload there or generate one in{" "}
              <Link href="/app/studio" className="underline">
                the studio
              </Link>{" "}
              first.
            </p>
            {add.error && (
              <p className="text-xs text-red-300">{add.error.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              size="sm"
              disabled={
                !name.trim() ||
                media.length === 0 ||
                (media[0]?.type === "video" && !media[0]?.thumbnail) ||
                add.isPending
              }
              title={
                media[0]?.type === "video" && !media[0]?.thumbnail
                  ? "This video has no thumbnail in the library — Meta requires one"
                  : undefined
              }
              loading={add.isPending}
              onClick={() =>
                add.mutate({
                  campaignId,
                  name: name.trim(),
                  type: "creative",
                  headline: name.trim(),
                  body: body.trim() || null,
                  linkUrl: linkUrl.trim() || null,
                  media: media.map((item) => ({
                    url: item.url,
                    type: item.type,
                    assetId: item.assetId,
                    thumbnail: item.thumbnail,
                  })),
                })
              }
            >
              Add draft ad
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MediaPickerDialog
        brandId={brandId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        existingAssetIds={media.flatMap((item) =>
          item.assetId ? [item.assetId] : [],
        )}
        onPick={(item) => {
          // A video stands alone; an image appends as the next carousel card.
          setMedia((current) =>
            item.type === "video" ? [item] : [...current, item],
          );
          setPickerOpen(false);
        }}
      />
    </>
  );
}
