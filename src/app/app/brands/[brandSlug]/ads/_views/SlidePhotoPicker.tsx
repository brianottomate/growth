"use client";

import { useState } from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sameIdeaSource, type IdeaSource } from "@/lib/ad-idea-studio";

export type PickerHome = {
  id: string;
  name: string;
  photos: (IdeaSource & { label: string })[];
};

/** WanderOS serves a 640px sibling of every full upload. */
function thumbOf(url: string) {
  return url.replace(
    /^(https:\/\/assets\.wander\.com\/[^/]+\/)fullres\.webp$/,
    "$1640.webp",
  );
}

/**
 * The catalog's photo switcher, in the slide's row: the home's photos with the
 * current one ringed, and a pick is the change. Other homes are a select away,
 * the library and uploads a button away.
 */
export function SlidePhotoPicker({
  homes,
  loading,
  initialHomeId,
  current,
  disabled,
  onPick,
  onLibrary,
  onDone,
}: {
  homes: PickerHome[];
  loading: boolean;
  initialHomeId: string | null;
  current: IdeaSource | null;
  disabled: boolean;
  onPick: (source: IdeaSource) => void;
  onLibrary: () => void;
  onDone: () => void;
}) {
  const [chosenHomeId, setChosenHomeId] = useState<string | null>(null);
  const holding = current
    ? homes.find((home) =>
        home.photos.some((photo) => sameIdeaSource(photo, current)),
      )
    : undefined;
  const home =
    homes.find((h) => h.id === (chosenHomeId ?? initialHomeId)) ??
    holding ??
    homes[0];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-sm font-medium">Choose a photo</h5>
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
      {homes.length > 1 && (
        <Select value={home?.id} onValueChange={setChosenHomeId}>
          <SelectTrigger aria-label="House" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-96">
            {homes.map((h) => (
              <SelectItem key={h.id} value={h.id} textValue={h.name}>
                {h.name} · {h.photos.length} photos
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading photos…</p>
      ) : !home?.photos.length ? (
        <p className="text-sm text-muted-foreground">
          No photos for this home. Choose from the library or upload.
        </p>
      ) : (
        <div className="grid max-h-96 grid-cols-3 gap-2 overflow-y-auto @xl:grid-cols-4">
          {home.photos.map((photo) => {
            const selected = current ? sameIdeaSource(photo, current) : false;
            return (
              <button
                key={photo.url}
                type="button"
                disabled={disabled}
                aria-label={`Use ${photo.label}`}
                aria-pressed={selected}
                onClick={() =>
                  onPick({
                    url: photo.url,
                    homeId: photo.homeId,
                    ...(photo.assetId ? { assetId: photo.assetId } : {}),
                  })
                }
                className="disabled:opacity-50"
              >
                <Image
                  unoptimized
                  src={thumbOf(photo.url)}
                  alt={photo.label}
                  width={160}
                  height={160}
                  className={`aspect-square w-full rounded object-cover ${selected ? "ring-2 ring-foreground" : ""}`}
                />
              </button>
            );
          })}
        </div>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={onLibrary}
      >
        Choose from library or upload
      </Button>
    </div>
  );
}
