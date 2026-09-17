"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/lib/utils";
import { homeCatalogCopy, homeCatalogPreviewUrl } from "@/lib/home-ad-previews";
import type { CompositionFormatId } from "@/lib/compositions";

import type { WorkspaceHome } from "./ClientWorkspace";

const FORMATS: { id: CompositionFormatId; label: string; aspect: string }[] = [
  { id: "square", label: "1:1", aspect: "aspect-square" },
  { id: "portrait", label: "4:5", aspect: "aspect-[4/5]" },
  { id: "story", label: "9:16", aspect: "aspect-[9/16]" },
  { id: "landscape", label: "16:9", aspect: "aspect-video" },
];

export function CreativePanel({
  brandId,
  homes,
}: {
  brandId: string;
  homes: WorkspaceHome[];
}) {
  const [homeId, setHomeId] = useState(homes[0]?.id ?? "");
  const [formatId, setFormatId] = useState<CompositionFormatId>("portrait");
  const home = homes.find((item) => item.id === homeId) ?? homes[0];
  const format = FORMATS.find((item) => item.id === formatId)!;

  if (!home) {
    return (
      <p className="rounded-xl border bg-card p-6 text-center text-xs text-muted-foreground">
        No homes with a photo to draw on.
      </p>
    );
  }

  const copy = homeCatalogCopy(home);
  const src = homeCatalogPreviewUrl({
    brandId,
    source: { url: home.imageUrl },
    formatId,
    copy,
  });

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[210px_minmax(0,1fr)_300px]">
      <aside className="rounded-xl border bg-card p-3">
        <h3 className="px-2 text-xs font-semibold">
          Homes on the feed · {homes.length}
        </h3>
        <div
          className="mt-2 max-h-[460px] space-y-1 overflow-y-auto"
          role="group"
          aria-label="Select a home"
        >
          {homes.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setHomeId(item.id)}
              aria-pressed={item.id === home.id}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border p-1.5 text-left transition-colors",
                item.id === home.id
                  ? "border-foreground bg-muted"
                  : "border-transparent hover:bg-muted/60",
              )}
            >
              <span className="relative size-9 shrink-0 overflow-hidden rounded bg-muted">
                {/* oxlint-disable-next-line nextjs/no-img-element */}
                <img
                  src={item.thumbUrl ?? item.imageUrl}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover"
                />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">
                  {item.name}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {[item.city, item.state].filter(Boolean).join(", ")}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="min-w-0 rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">{home.name} · Catalog card</h3>
            <p className="text-xs text-muted-foreground">
              Live render from the brand&apos;s composition · same as production
            </p>
          </div>
        </div>
        <div
          className="mt-4 flex flex-wrap gap-2"
          role="group"
          aria-label="Select a creative format"
        >
          {FORMATS.map((item) => (
            <Button
              key={item.id}
              variant={formatId === item.id ? "default" : "outline"}
              size="xs"
              onClick={() => setFormatId(item.id)}
              aria-pressed={formatId === item.id}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="mt-4 flex min-h-[430px] items-center justify-center rounded-xl bg-muted/40 p-4">
          <div
            className={cn(
              "w-full max-w-[380px] overflow-hidden rounded-sm bg-black/20",
              format.aspect,
            )}
          >
            {/* oxlint-disable-next-line nextjs/no-img-element */}
            <img
              src={src}
              alt={`${home.name} catalog card`}
              className="size-full object-cover"
            />
          </div>
        </div>
      </section>

      <aside className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold">Catalog copy</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Written from the feed facts.
        </p>
        <dl className="mt-5 space-y-4 text-xs">
          <Field label="Eyebrow" value={copy.eyebrow} />
          <Field label="Title" value={copy.title} />
          <Field label="Subtitle" value={copy.subtitle} />
          <Field
            label="Rating"
            value={copy.rating != null ? `${copy.rating.toFixed(1)} / 5` : "—"}
          />
        </dl>
      </aside>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="mb-1.5 font-medium text-muted-foreground">{label}</dt>
      <dd className="rounded-lg border bg-muted/30 p-3 leading-5 break-words">
        {value}
      </dd>
    </div>
  );
}
