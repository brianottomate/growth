"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import { cn } from "@/components/ui/lib/utils";
import {
  homeCatalogCopy,
  homeCatalogPreviewUrl,
  type HomeForPreview,
} from "@/lib/home-ad-previews";

export type CatalogHome = HomeForPreview & {
  id: string;
  imageUrl: string;
  nightlyFrom?: number | null;
};

/** A page of cards. Every card is a server render, so they arrive in tens. */
const PAGE = 10;

const panel = "bg-card overflow-hidden rounded-2xl border";
const sectionLabel =
  "text-muted-foreground text-[10.5px] font-semibold tracking-[0.09em] uppercase";

/** What the download is, on hover; the page itself stays heading and data. */
const FEED_TITLE =
  "Meta Hotels and rentals feed, one row per home with a photo. Street address and coordinates are not on the WanderOS feed and export empty.";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * The whole roster on the listing card, the way an Advantage+ catalog ad
 * would draw it, with the feed Meta wants beside it.
 *
 * This sits with the homes rather than with a campaign's set: it is about
 * every home a client has, not the handful an ad is running on.
 */
export function CatalogGrid({
  homes,
  brandId,
}: {
  homes: CatalogHome[];
  brandId: string;
}) {
  const [shown, setShown] = useState(PAGE);
  const visible = homes.slice(0, shown);
  const left = homes.length - visible.length;
  const exportHref = (format: "csv" | "xml") =>
    `/api/performance/catalog/${encodeURIComponent(brandId)}?format=${format}`;

  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={sectionLabel}>
          Catalog · {visible.length}/{homes.length}
        </p>
        <div className="flex items-center gap-3 text-[11.5px]">
          <a
            href={exportHref("csv")}
            download
            title={FEED_TITLE}
            className="inline-flex items-center gap-1 text-sky-300 hover:underline"
          >
            <Download className="size-3" />
            Meta CSV
          </a>
          <a
            href={exportHref("xml")}
            download
            title={FEED_TITLE}
            className="inline-flex items-center gap-1 text-sky-300 hover:underline"
          >
            <Download className="size-3" />
            Meta XML
          </a>
        </div>
      </div>

      {homes.length === 0 ? (
        <p className={cn(panel, "text-muted-foreground px-4 py-8 text-center text-xs")}>
          No homes with a photo on the feed.
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-5">
            {visible.map((home) => (
              <li key={home.id} className={panel}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
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
                <div className="px-2.5 py-2">
                  <p className="truncate text-[11.5px] font-medium">{home.name}</p>
                  <p className="text-muted-foreground truncate text-[10.5px]">
                    {home.nightlyFrom
                      ? `${money(home.nightlyFrom)} USD`
                      : "no rate"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {left > 0 ? (
            <div className="flex items-center gap-3 text-[11.5px]">
              <button
                type="button"
                onClick={() => setShown(shown + PAGE)}
                className="text-sky-300 hover:underline"
              >
                Load {Math.min(PAGE, left)} more
              </button>
              {left > PAGE ? (
                <button
                  type="button"
                  onClick={() => setShown(homes.length)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Show all {homes.length}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
