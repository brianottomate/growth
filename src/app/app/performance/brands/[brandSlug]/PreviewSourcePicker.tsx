"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Check, ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/components/ui/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";

export type PickerHome = { url: string; name: string; imageUrl: string; thumbUrl: string | null };
export type PickerImage = { id: string; url: string; thumbnailUrl: string | null; title: string | null };

/**
 * Where the on-demand ad previews draw their photo from. Two doors: one of
 * their homes (its hero, and the home supplies the copy) or an image already
 * in the library. Either is a URL the preview route can draw straight from,
 * so nothing is imported to make a choice.
 */
export function PreviewSourcePicker({
  brandId,
  homes,
  images,
  current,
}: {
  brandId: string;
  homes: PickerHome[];
  images: PickerImage[];
  current: { sourceUrl: string | null; label: string; thumbUrl: string | null };
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const trpc = useTRPC();
  const set = useMutation(
    trpc.brand.setPreviewSource.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hover:bg-muted flex items-center gap-2 rounded-full border py-0.5 pr-3 pl-0.5 text-[11.5px]"
        title="Choose the photo the previews are drawn on"
      >
        {current.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.thumbUrl} alt="" className="size-6 rounded-full object-cover" />
        ) : (
          <span className="bg-muted grid size-6 place-items-center rounded-full">
            <ImageIcon className="size-3" />
          </span>
        )}
        <span className="max-w-48 truncate">{current.label}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] w-[96vw] max-w-3xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-5 py-3 pr-12 text-left">
            <DialogTitle className="text-sm">Photo for the ad previews</DialogTitle>
            <DialogDescription className="text-xs">
              A home brings its copy with it; a library image keeps the featured home&apos;s copy.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue={homes.length > 0 ? "homes" : "library"} className="min-h-0 flex-1 overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-5 pt-3">
              <TabsList>
                <TabsTrigger value="homes">Their homes{homes.length ? ` · ${homes.length}` : ""}</TabsTrigger>
                <TabsTrigger value="library">Library{images.length ? ` · ${images.length}` : ""}</TabsTrigger>
              </TabsList>
              {current.sourceUrl ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11.5px]"
                  disabled={set.isPending}
                  onClick={() => set.mutate({ id: brandId, listingUrl: null, sourceUrl: null })}
                >
                  Clear choice
                </Button>
              ) : null}
            </div>
            <TabsContent value="homes" className="min-h-0 overflow-y-auto p-5 pt-3">
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {homes.map((home) => (
                  <Tile
                    key={home.url}
                    src={home.thumbUrl ?? home.imageUrl}
                    label={home.name}
                    selected={current.sourceUrl === home.imageUrl}
                    disabled={set.isPending}
                    onClick={() => set.mutate({ id: brandId, listingUrl: home.url, sourceUrl: home.imageUrl })}
                  />
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="library" className="min-h-0 overflow-y-auto p-5 pt-3">
              {images.length === 0 ? (
                <p className="text-muted-foreground text-xs">Nothing in the library yet.</p>
              ) : (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {images.map((image) => (
                    <Tile
                      key={image.id}
                      src={image.thumbnailUrl ?? image.url}
                      label={image.title ?? "Untitled"}
                      selected={current.sourceUrl === image.url}
                      disabled={set.isPending}
                      onClick={() => set.mutate({ id: brandId, sourceUrl: image.url })}
                    />
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Tile({
  src,
  label,
  selected,
  disabled,
  onClick,
}: {
  src: string;
  label: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={selected}
        className={cn(
          "group relative block w-full overflow-hidden rounded-lg border text-left",
          selected ? "ring-2 ring-sky-400" : "hover:opacity-90",
        )}
        title={label}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={label} loading="lazy" className="aspect-square w-full object-cover" />
        {selected ? (
          <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-sky-400 text-white">
            <Check className="size-3" />
          </span>
        ) : null}
        <span className="block truncate px-1.5 py-1 text-[10.5px]">{label}</span>
      </button>
    </li>
  );
}
