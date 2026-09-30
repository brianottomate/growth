"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ImageIcon, Loader2, Plus, X } from "lucide-react";

import type { DigestProperty, DigestSection } from "@/lib/listings-digest";
import { orpc } from "@/orpc/client";
import { BrandHomePicker } from "./BrandHomesCard";

const LAYOUTS = [
  [null, "Standard"],
  ["feature", "Feature"],
  ["list", "List"],
  ["grid", "Grid"],
] as const;

function PhotoChooser({
  homeId,
  current,
  onPick,
}: {
  homeId: string;
  current: string | null | undefined;
  onPick: (url: string) => void;
}) {
  const photos = useQuery(
    orpc.newsletter.emailHomePhotos.queryOptions({ input: { homeId } }),
  );
  if (photos.isLoading) {
    return (
      <Loader2 className="my-2 size-4 animate-spin text-muted-foreground" />
    );
  }
  return (
    <div className="mt-1.5 grid max-h-48 grid-cols-4 gap-1 overflow-auto">
      {(photos.data?.photos ?? []).map((photo) => (
        <button
          key={photo.url}
          type="button"
          onClick={() => onPick(photo.url)}
          className={`overflow-hidden rounded ${
            photo.url === current ? "ring-2 ring-primary" : ""
          }`}
        >
          {/* oxlint-disable-next-line nextjs/no-img-element */}
          <img
            src={photo.url}
            alt=""
            className="aspect-[3/2] w-full object-cover"
          />
        </button>
      ))}
    </div>
  );
}

/**
 * One group of home cards: its title, its layout, and its homes in order,
 * each with its photo for this issue.
 */
export function HomeGroupEditor({
  section,
  brandId,
  campaign,
  canAddHomes,
  onChange,
}: {
  section: DigestSection;
  brandId: string;
  campaign: string;
  /** The brand has its own homes to pick from. */
  canAddHomes: boolean;
  onChange: (next: DigestSection) => void;
}) {
  const [heading, setHeading] = useState(section.heading);
  const [photoFor, setPhotoFor] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const homes = section.properties;

  const setHomes = (next: DigestProperty[]) =>
    onChange({ ...section, properties: next });
  const move = (index: number, by: -1 | 1) => {
    const next = [...homes];
    const [home] = next.splice(index, 1);
    next.splice(index + by, 0, home!);
    setHomes(next);
  };

  return (
    <div className="grid grid-cols-1 gap-2">
      <input
        value={heading}
        onChange={(event) => setHeading(event.target.value)}
        onBlur={() =>
          heading !== section.heading && onChange({ ...section, heading })
        }
        aria-label="Title above the cards"
        placeholder="Title above the cards (optional)"
        className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/30"
      />
      <div className="flex overflow-hidden rounded-md border text-[11px] font-medium">
        {LAYOUTS.map(([value, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => onChange({ ...section, layout: value })}
            className={`flex-1 px-2 py-1 ${
              (section.layout ?? null) === value
                ? "bg-foreground text-background"
                : "hover:bg-accent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ol className="space-y-1">
        {homes.map((home, index) => (
          <li key={`${home.homeId ?? home.name}-${index}`}>
            <div className="flex items-center gap-2 rounded-lg border p-1.5">
              {home.imageUrl ? (
                // oxlint-disable-next-line nextjs/no-img-element
                <img
                  src={home.imageUrl}
                  alt=""
                  className="h-9 w-14 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="h-9 w-14 shrink-0 rounded bg-muted" />
              )}
              <span className="min-w-0 flex-1 truncate text-xs font-medium">
                {home.name}
              </span>
              {home.homeId && (
                <button
                  type="button"
                  aria-label="Choose photo"
                  onClick={() => setPhotoFor(photoFor === index ? null : index)}
                  className="grid size-7 place-items-center rounded-md hover:bg-accent"
                >
                  <ImageIcon className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                aria-label="Move up"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className="grid size-7 place-items-center rounded-md hover:bg-accent disabled:opacity-30"
              >
                <ArrowUp className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={index === homes.length - 1}
                onClick={() => move(index, 1)}
                className="grid size-7 place-items-center rounded-md hover:bg-accent disabled:opacity-30"
              >
                <ArrowDown className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Remove home"
                disabled={homes.length === 1}
                onClick={() => setHomes(homes.filter((_, i) => i !== index))}
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-30"
              >
                <X className="size-3.5" />
              </button>
            </div>
            {photoFor === index && home.homeId && (
              <PhotoChooser
                homeId={home.homeId}
                current={home.heroUrl ?? home.imageUrl}
                onPick={(url) => {
                  setHomes(
                    homes.map((h, i) =>
                      i === index ? { ...h, imageUrl: url, heroUrl: url } : h,
                    ),
                  );
                  setPhotoFor(null);
                }}
              />
            )}
          </li>
        ))}
      </ol>

      {canAddHomes &&
        (adding ? (
          <BrandHomePicker
            brandId={brandId}
            campaign={campaign}
            onAdd={(added) => {
              setHomes([...homes, ...added]);
              setAdding(false);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex w-fit items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent"
          >
            <Plus className="size-3.5" /> Add homes
          </button>
        ))}
    </div>
  );
}
