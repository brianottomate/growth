"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

export type PreviewImageOption = {
  name: string;
  imageUrl: string;
  thumbUrl: string;
};

export function BrandPreviewImagePicker({
  brandId,
  images,
}: {
  brandId: string;
  images: PreviewImageOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"library" | "homes">("library");
  const [search, setSearch] = useState("");
  const library = useQuery({
    ...orpc.media.list.queryOptions({
      input: { brandId, kind: "image", query: search },
    }),
    enabled: open && source === "library",
  });
  const save = useMutation(
    orpc.brand.setPreviewSource.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const choose = (sourceUrl: string | null) =>
    save.mutate({ id: brandId, listingUrl: null, sourceUrl });
  const options =
    source === "homes"
      ? images.filter((image) =>
          image.name.toLowerCase().includes(search.toLowerCase()),
        )
      : (library.data ?? []).flatMap((asset) =>
          asset.url
            ? [
                {
                  name: asset.title ?? asset.filename ?? "Image",
                  imageUrl: asset.url,
                  thumbUrl: asset.thumbnailUrl ?? asset.url,
                },
              ]
            : [],
        );
  return (
    <>
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Choose preview image
        </Button>
      </div>
      <SimpleDialog
        open={open}
        onOpenChange={(next) => {
          if (!save.isPending) setOpen(next);
        }}
        title="Choose preview image"
        size="xl"
        scrollable
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={source === "library" ? "default" : "outline"}
              onClick={() => setSource("library")}
            >
              Library
            </Button>
            {images.length > 0 && (
              <Button
                size="sm"
                variant={source === "homes" ? "default" : "outline"}
                onClick={() => setSource("homes")}
              >
                Home photos
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={save.isPending}
              onClick={() => choose(null)}
            >
              Use website image
            </Button>
          </div>
          <Input
            aria-label="Search preview images"
            placeholder="Search images…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {source === "library" && library.isError ? (
            <p role="alert">
              Could not load images.{" "}
              <button
                onClick={() => void library.refetch()}
                className="underline"
              >
                Retry
              </button>
            </p>
          ) : source === "library" && library.isLoading ? (
            <p>Loading images…</p>
          ) : options.length === 0 ? (
            <p className="text-sm text-muted-foreground">No images found.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 @lg:grid-cols-3">
              {options.map((image) => (
                <button
                  key={image.imageUrl}
                  type="button"
                  disabled={save.isPending}
                  onClick={() => choose(image.imageUrl)}
                  className="overflow-hidden rounded-lg border text-left disabled:opacity-50"
                >
                  {/* oxlint-disable-next-line nextjs/no-img-element */}
                  <img
                    src={image.thumbUrl}
                    alt={image.name}
                    loading="lazy"
                    className="aspect-video w-full object-cover"
                  />
                  <span className="block truncate p-2 text-xs">
                    {image.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </SimpleDialog>
    </>
  );
}
