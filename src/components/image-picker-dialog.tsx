"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/compound/combobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export type PickerImage = {
  url: string;
  assetId?: string;
  label?: string;
  thumbUrl?: string;
};
export type ImagePickerHome = {
  id: string;
  name: string;
  photos: PickerImage[];
};
export function ImagePickerDialog({
  open,
  onOpenChange,
  homes,
  pool,
  current,
  onPick,
  onLibrary,
  scope,
  onScopeChange,
  sizeLabel,
  onMakeHero,
  loading = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  homes: ImagePickerHome[];
  pool?: PickerImage[];
  current?: PickerImage | null;
  onPick: (image: PickerImage) => void;
  onLibrary: () => void;
  scope?: "all" | "size";
  onScopeChange?: (scope: "all" | "size") => void;
  sizeLabel?: string;
  onMakeHero?: (image: PickerImage) => void;
  loading?: boolean;
}) {
  const [source, setSource] = useState<"home" | "pool">("home");
  const [homeId, setHomeId] = useState("");
  const [chosenPhoto, setChosenPhoto] = useState<PickerImage | null>(null);
  const home =
    homes.find((h) => h.id === homeId) ??
    homes.find((h) => h.photos.some((p) => p.url === current?.url)) ??
    homes[0];
  const photos = source === "pool" ? (pool ?? []) : (home?.photos ?? []);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose image</DialogTitle>
          <DialogDescription>
            {scope === "size"
              ? `Choose artwork for ${sizeLabel}.`
              : scope === "all"
                ? "Use this image across all sizes."
                : "Choose an image for this catalog card."}
          </DialogDescription>
        </DialogHeader>
        {scope && onScopeChange && (
          <div
            role="group"
            aria-label="Image scope"
            className="flex flex-wrap gap-2"
          >
            <Button
              variant={scope === "all" ? "secondary" : "outline"}
              aria-pressed={scope === "all"}
              onClick={() => onScopeChange("all")}
            >
              All sizes
            </Button>
            <Button
              variant={scope === "size" ? "secondary" : "outline"}
              aria-pressed={scope === "size"}
              onClick={() => onScopeChange("size")}
            >
              This size · {sizeLabel}
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={source === "home" ? "secondary" : "outline"}
            onClick={() => setSource("home")}
          >
            Home photos
          </Button>
          {pool !== undefined && (
            <Button
              variant={source === "pool" ? "secondary" : "outline"}
              onClick={() => setSource("pool")}
            >
              Image pool · {pool.length}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onLibrary();
            }}
          >
            Library or upload
          </Button>
        </div>
        {source === "home" && homes.length > 1 && (
          <Combobox
            value={home?.id}
            onValueChange={(value) => {
              if (value) setHomeId(value);
            }}
            placeholder="Choose a home"
            searchPlaceholder="Search homes…"
            options={homes.map((h) => ({
              value: h.id,
              label: h.name,
              imageUrl: h.photos[0]?.thumbUrl ?? h.photos[0]?.url,
            }))}
          />
        )}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading photos…</p>
        ) : !photos.length ? (
          <p className="text-sm text-muted-foreground">
            No images here. Choose from the library or upload.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo, index) => (
              <div key={photo.assetId ?? photo.url} className="space-y-1">
                <button
                  type="button"
                  aria-label={`Choose ${photo.label ?? `image ${index + 1}`}`}
                  aria-pressed={photo.url === current?.url}
                  className="w-full overflow-hidden rounded-lg border aria-pressed:ring-2 aria-pressed:ring-primary"
                  onClick={() => {
                    setChosenPhoto(photo);
                    onPick(photo);
                    onOpenChange(false);
                  }}
                >
                  <Image
                    src={photo.thumbUrl ?? photo.url}
                    alt={photo.label ?? "Home photo"}
                    width={240}
                    height={180}
                    unoptimized
                    className="aspect-[4/3] w-full object-cover"
                  />
                  {photo.label && (
                    <span className="block truncate p-2 text-xs">
                      {photo.label}
                    </span>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
        {onMakeHero &&
          (() => {
            const hero =
              chosenPhoto ??
              homes
                .flatMap((home) => home.photos)
                .find((photo) => photo.url === current?.url);
            return hero ? (
              <div className="space-y-1 border-t pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onMakeHero(hero)}
                >
                  Make selected image the home hero
                </Button>
                <p className="text-xs text-muted-foreground">
                  Updates the home’s shared photo across the workspace.
                </p>
              </div>
            ) : null;
          })()}
      </DialogContent>
    </Dialog>
  );
}
