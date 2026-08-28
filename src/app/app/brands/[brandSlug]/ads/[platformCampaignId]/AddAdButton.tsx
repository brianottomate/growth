"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ImagePlus, Plus } from "lucide-react";

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

/**
 * Draft an ad onto a draft campaign. The creative comes from the brand's
 * media library — the same pool the studio and compositions publish into —
 * so anything made anywhere in growth is one picker away from being an ad.
 */
export function AddAdButton({
  campaignId,
  brandId,
}: {
  campaignId: string;
  brandId: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [media, setMedia] = useState<MediaItem | null>(null);

  const add = useMutation(
    trpc.ads.addDraftAd.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        setName("");
        setBody("");
        setMedia(null);
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
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="bg-muted hover:border-white/25 flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
              >
                {media ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={media.thumbnail ?? media.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-muted-foreground flex flex-col items-center gap-1 text-xs">
                    <ImagePlus className="size-4" />
                    From library
                  </span>
                )}
              </button>
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
                  <Label htmlFor="ad-link">Link URL</Label>
                  <Input
                    id="ad-link"
                    value={linkUrl}
                    onChange={(event) => setLinkUrl(event.target.value)}
                    placeholder="https://…"
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
              disabled={!name.trim() || !media || add.isPending}
              loading={add.isPending}
              onClick={() =>
                add.mutate({
                  campaignId,
                  name: name.trim(),
                  body: body.trim() || null,
                  linkUrl: linkUrl.trim() || null,
                  media: media
                    ? [
                        {
                          url: media.url,
                          type: media.type,
                          assetId: media.assetId,
                          thumbnail: media.thumbnail,
                        },
                      ]
                    : null,
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
        existingAssetIds={media?.assetId ? [media.assetId] : []}
        onPick={(item) => {
          setMedia(item);
          setPickerOpen(false);
        }}
      />
    </>
  );
}
