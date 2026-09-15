"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Home, Loader2 } from "lucide-react";

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
 * A look at the brand's listing photos before any of them enter the library.
 *
 * The grid is the site's own feed, thumbnails hot-linked; nothing is written
 * until the operator ticks homes and imports. A hero already in the library
 * shows as such and is simply selected, not imported again.
 */
export function ListingSamplesDialog({
  brandId,
  onImported,
}: {
  brandId: string;
  /** The imported assets, in the order picked; the first becomes the source. */
  onImported: (
    assets: { id: string; url: string | null }[],
  ) => void | Promise<void>;
}) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const samples = useQuery({
    ...trpc.media.listingSamples.queryOptions({ brandId }),
    enabled: open,
  });
  const homes = samples.data?.homes ?? [];

  const importHomes = useMutation(
    trpc.media.importListingImages.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          `${result.assets.length} photo${result.assets.length === 1 ? "" : "s"} in the library`,
        );
        await onImported(result.assets);
        setOpen(false);
        setPicked(new Set());
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allPicked = homes.length > 0 && picked.size === homes.length;

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
          <Home className="size-3.5" />
          From their homes
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Their listing photos</DialogTitle>
          <DialogDescription>
            Straight from their site, nothing imported yet. Tick the ones worth
            working with; only those enter the library.
          </DialogDescription>
        </DialogHeader>

        {samples.isLoading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Reading their listings
          </div>
        ) : samples.error ? (
          <p className="text-xs text-red-300">{samples.error.message}</p>
        ) : !samples.data?.hasSite ? (
          <p className="text-sm text-muted-foreground">
            This brand has no website on record, so there is no feed to read.
          </p>
        ) : homes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No listings with photos on their site. Check the website is a
            WanderOS site.
          </p>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-4 gap-2 overflow-y-auto pr-1">
            {homes.map((home) => {
              const on = picked.has(home.id);
              return (
                <button
                  key={home.id}
                  type="button"
                  onClick={() => toggle(home.id)}
                  aria-pressed={on}
                  className={cn(
                    "group relative overflow-hidden rounded-lg border text-left transition",
                    on ? "ring-2 ring-primary" : "hover:border-white/30",
                  )}
                  title={home.name}
                >
                  {/* oxlint-disable-next-line nextjs/no-img-element */}
                  <img
                    src={home.thumbUrl}
                    alt={home.name}
                    className="aspect-[4/3] w-full object-cover"
                    loading="lazy"
                  />
                  <div className="space-y-0.5 p-2">
                    <div className="truncate text-xs font-medium">
                      {home.name}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {home.importedAssetId
                        ? "Already in the library"
                        : home.place}
                    </div>
                  </div>
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
          <Button
            size="sm"
            variant="ghost"
            disabled={homes.length === 0}
            onClick={() =>
              setPicked(
                allPicked ? new Set() : new Set(homes.map((home) => home.id)),
              )
            }
          >
            {allPicked ? "Clear" : `Select all ${homes.length}`}
          </Button>
          <Button
            size="sm"
            disabled={picked.size === 0 || importHomes.isPending}
            loading={importHomes.isPending}
            onClick={() =>
              importHomes.mutate({
                brandId,
                homes: homes
                  .filter((home) => picked.has(home.id))
                  .map((home) => ({
                    imageUrl: home.imageUrl,
                    name: home.name,
                  })),
              })
            }
          >
            {importHomes.isPending
              ? "Importing…"
              : `Import ${picked.size || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
