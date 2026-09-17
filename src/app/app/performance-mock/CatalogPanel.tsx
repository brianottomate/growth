"use client";

import { useState } from "react";
import { Download, ShieldCheck } from "lucide-react";

import { cn } from "@/components/ui/lib/utils";

import { CATALOG } from "./data";

const PAGE = 8;

export function CatalogPanel() {
  const [page, setPage] = useState(PAGE);
  const [showFeedNote, setShowFeedNote] = useState(false);
  const visible = CATALOG.slice(0, page);
  const left = CATALOG.length - visible.length;

  return (
    <div className="min-w-0 space-y-4">
      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">
              Demo catalog · {CATALOG.length} cards
            </h3>
            <p className="text-xs text-muted-foreground">
              The full fictional portfolio an Advantage+ catalog ad would draw
              from · wider than the {CATALOG.filter((c) => c.starting).length}{" "}
              hand-picked starting homes.
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11.5px]">
            {(["CSV", "XML"] as const).map((format) => (
              <button
                key={format}
                type="button"
                onClick={() => setShowFeedNote(true)}
                className="inline-flex items-center gap-1 text-sky-300 hover:underline"
              >
                <Download className="size-3" aria-hidden="true" />
                Meta {format}
              </button>
            ))}
          </div>
        </div>

        {showFeedNote ? (
          <p
            role="status"
            className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-[11px] leading-5 text-muted-foreground"
          >
            <ShieldCheck className="mr-1 inline size-3" aria-hidden="true" />
            Demo only — no file downloads here. In production this exports a
            Meta Hotels and rentals feed, one row per home with a photo.
          </p>
        ) : null}

        <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((home) => (
            <li
              key={home.id}
              className={cn(
                "relative flex aspect-square flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-br p-2.5 text-white shadow-sm",
                home.palette,
              )}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="rounded bg-black/55 px-1.5 py-0.5 text-[8px] font-bold tracking-wider">
                  ILLUSTRATIVE
                </span>
                {home.starting ? (
                  <span className="rounded bg-white/85 px-1.5 py-0.5 text-[8px] font-bold tracking-wide text-black">
                    STARTING
                  </span>
                ) : null}
              </div>
              <div className="-mx-2.5 -mb-2.5 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-2.5 pt-8 pb-2.5">
                <p className="text-xs leading-tight font-semibold">
                  {home.name}
                </p>
                <p className="text-[9px] opacity-90">in {home.place}</p>
                <p className="mt-0.5 text-[9px] opacity-75">{home.facts}</p>
              </div>
            </li>
          ))}
        </ul>

        {left > 0 ? (
          <div className="mt-3 flex items-center gap-3 text-[11.5px]">
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
                onClick={() => setPage(CATALOG.length)}
                className="text-muted-foreground hover:text-foreground"
              >
                Show all {CATALOG.length}
              </button>
            ) : null}
          </div>
        ) : null}

        <p className="mt-4 rounded-lg border bg-muted/40 p-3 text-[11px] leading-5 text-muted-foreground">
          <ShieldCheck className="mr-1 inline size-3" aria-hidden="true" />
          Every card, name, place, and photo here is illustrative. Production
          catalog cards render from real approved property assets and the
          client&apos;s own feed.
        </p>
      </section>
    </div>
  );
}
