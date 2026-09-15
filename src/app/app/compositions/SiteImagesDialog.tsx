"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Globe, Loader2 } from "lucide-react";

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
import { toast } from "@/components/ui/toast";
import { cn } from "@/components/ui/lib/utils";
import { useTRPC } from "@/trpc/react";

/**
 * The images on the brand's own site, read on demand. Nothing enters the
 * library until the operator ticks and imports; an image already imported
 * shows as such.
 */
export function SiteImagesDialog({
  brandId,
  onImported,
  label = "From their site",
}: {
  brandId: string;
  onImported: (
    assets: { id: string; url: string | null }[],
  ) => void | Promise<void>;
  label?: string;
}) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());

  const scrape = useQuery({
    ...trpc.media.siteImages.queryOptions({ brandId }),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  // The browser is the judge of a broken image; a URL that will not load
  // drops out rather than being shown as a blank tile.
  const images = (scrape.data?.images ?? []).filter(
    (image) => !failed.has(image.url),
  );

  const importImages = useMutation(
    trpc.media.importUrls.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          `${result.assets.length} image${result.assets.length === 1 ? "" : "s"} in the library`,
        );
        await onImported(result.assets);
        setOpen(false);
        setPicked(new Set());
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const toggle = (url: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPicked(new Set());
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8">
          <Globe className="size-3.5" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Images on their site</DialogTitle>
          <DialogDescription>
            {scrape.data?.site
              ? scrape.data.site.replace(/^https?:\/\//, "")
              : "Read from the brand's website."}{" "}
            Tick the ones worth keeping.
          </DialogDescription>
        </DialogHeader>
        {scrape.isLoading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Reading their site
          </div>
        ) : scrape.error ? (
          <p className="text-xs text-red-300">{scrape.error.message}</p>
        ) : !scrape.data?.site ? (
          <p className="text-sm text-muted-foreground">
            This brand has no website on record.
          </p>
        ) : images.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No usable images found on the page.
          </p>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-4 gap-2 overflow-y-auto pr-1">
            {images.map((image) => {
              const on = picked.has(image.url);
              return (
                <button
                  key={image.url}
                  type="button"
                  onClick={() => toggle(image.url)}
                  aria-pressed={on}
                  className={cn(
                    "relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted text-left",
                    on ? "ring-2 ring-primary" : "hover:border-white/30",
                  )}
                  title={image.url}
                >
                  {/* oxlint-disable-next-line nextjs/no-img-element */}
                  <img
                    src={image.url}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="size-full object-cover"
                    onError={() =>
                      setFailed((current) => new Set(current).add(image.url))
                    }
                  />
                  {image.importedAssetId ? (
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      In library
                    </span>
                  ) : null}
                  {on ? (
                    <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {images.length ? `${picked.size} of ${images.length}` : ""}
          </span>
          <Button
            size="sm"
            disabled={picked.size === 0 || importImages.isPending}
            loading={importImages.isPending}
            onClick={() =>
              importImages.mutate({
                brandId,
                images: [...picked].map((url) => ({ url })),
              })
            }
          >
            {importImages.isPending
              ? "Importing…"
              : `Import ${picked.size || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
