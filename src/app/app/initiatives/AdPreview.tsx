"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { MediaAssetView } from "@/components/media-asset-view";

export function AdPreview({
  title,
  status,
  description,
  media,
  href,
}: {
  title: string;
  status: string;
  description: string | null;
  media: {
    url: string;
    type: "image" | "video" | "carousel";
    thumbnail: string | null;
    width: number | null;
    height: number | null;
  }[];
  href: string;
}) {
  const [open, setOpen] = useState(false);
  const first = media[0];
  const formats = [
    ...new Set(
      media.flatMap((item) => {
        if (!item.width || !item.height) return [];
        const ratio = item.width / item.height;
        if (Math.abs(ratio - 1) < 0.03) return ["Square"];
        if (Math.abs(ratio - 9 / 16) < 0.03) return ["Story"];
        if (Math.abs(ratio - 4 / 5) < 0.03) return ["Portrait"];
        return [ratio > 1 ? "Landscape" : "Portrait"];
      }),
    ),
  ];
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Preview ${title}`}
        className="relative flex h-full w-full items-center gap-3 rounded-xl border bg-card p-3 text-left hover:border-muted-foreground/40 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="absolute top-3 right-3 rounded-md border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground capitalize">
          {status}
        </span>
        <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {first ? (
            <Image
              width={80}
              height={80}
              unoptimized
              src={first.thumbnail ?? first.url}
              alt=""
              loading="lazy"
              className="size-full object-contain"
            />
          ) : (
            <ImageIcon className="size-5 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 space-y-1">
          <span className="line-clamp-2 block pr-20 text-sm font-medium">
            {title}
          </span>
          <span className="line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
            {description}
          </span>
          {formats.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {formats.map((format) => (
                <span
                  key={format}
                  className="rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground"
                >
                  {format}
                </span>
              ))}
            </span>
          )}
          {!first && (
            <span className="block text-xs text-muted-foreground">
              Artwork pending
            </span>
          )}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Ad preview</DialogDescription>
          {first ? (
            <div className="aspect-square max-h-[50dvh]">
              <MediaAssetView
                item={{
                  ...first,
                  thumbnail: first.thumbnail ?? undefined,
                  width: first.width ?? undefined,
                  height: first.height ?? undefined,
                }}
                label={`${title} artwork`}
              />
            </div>
          ) : (
            <div className="flex h-36 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              Artwork pending
            </div>
          )}
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {description}
          </p>
          <Button variant="outline" asChild>
            <Link href={href}>Open campaign</Link>
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
