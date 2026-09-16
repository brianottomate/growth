"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import { cn } from "@/components/ui/lib/utils";
import { homeCatalogCopy, homeCatalogPreviewUrl } from "@/lib/home-ad-previews";

/** A home as the catalog card draws it; only what the render needs. */
export type CatalogHome = {
  id: string;
  name: string;
  imageUrl: string;
  city: string | null;
  state: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  guests: number | null;
  rating: number | null;
};

/** Each card is a server render, so they arrive in tens. */
const PAGE = 10;

/** What the download is, on hover; the section itself stays heading and data. */
const FEED_TITLE =
  "Meta Hotels and rentals feed, one row per home with a photo. Street address and coordinates are not on the WanderOS feed and export empty.";

/**
 * The listing card an Advantage+ catalog ad would draw for each home, and the
 * Meta feed the catalog reads from. The photo roster lives on the Homes tab;
 * this is the same homes as the ad a catalog builds, at the foot of the wall.
 */
export function CatalogCards({
  brandId,
  homes,
}: {
  brandId: string;
  homes: CatalogHome[];
}) {
  const [page, setPage] = useState(PAGE);
  const visible = homes.slice(0, page);
  const left = homes.length - visible.length;

  if (homes.length === 0) return null;

  return (
    <section className="space-y-2.5 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Catalog cards{homes.length ? ` · ${homes.length}` : ""}
        </span>
        <div className="flex items-center gap-3 text-[11.5px]">
          {(["csv", "xml"] as const).map((format) => (
            <a
              key={format}
              href={`/api/performance/catalog/${encodeURIComponent(brandId)}?format=${format}`}
              download
              title={FEED_TITLE}
              className="inline-flex items-center gap-1 text-sky-300 hover:underline"
            >
              <Download className="size-3" />
              Meta {format.toUpperCase()}
            </a>
          ))}
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-2.5 @xl:grid-cols-3 @4xl:grid-cols-5">
        {visible.map((home) => (
          <li
            key={home.id}
            className="overflow-hidden rounded-2xl border bg-card"
          >
            {/* oxlint-disable-next-line nextjs/no-img-element */}
            <img
              src={homeCatalogPreviewUrl({
                brandId,
                source: { url: home.imageUrl },
                formatId: "square",
                copy: homeCatalogCopy(home),
              })}
              alt={home.name}
              loading="lazy"
              className="aspect-square w-full bg-black/20 object-cover"
            />
          </li>
        ))}
      </ul>
      {left > 0 ? (
        <div className="flex items-center gap-3 text-[11.5px]">
          <button
            type="button"
            onClick={() => setPage(page + PAGE)}
            className="text-sky-300 hover:underline"
          >
            Load {Math.min(PAGE, left)} more
          </button>
          {left > PAGE ? (
            <button
              type="button"
              onClick={() => setPage(homes.length)}
              className={cn("text-muted-foreground hover:text-foreground")}
            >
              Show all {homes.length}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
