"use client";

import { useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/lib/utils";

import { PROPERTIES } from "./data";

type Format = "1:1" | "4:5" | "9:16" | "16:9";
const FORMATS: {
  id: Format;
  name: string;
  dimensions: string;
  aspect: string;
  max: string;
}[] = [
  {
    id: "1:1",
    name: "Square",
    dimensions: "1080 × 1080",
    aspect: "aspect-square",
    max: "max-w-[360px]",
  },
  {
    id: "4:5",
    name: "Feed portrait",
    dimensions: "1080 × 1350",
    aspect: "aspect-[4/5]",
    max: "max-w-[340px]",
  },
  {
    id: "9:16",
    name: "Story/Reels",
    dimensions: "1080 × 1920",
    aspect: "aspect-[9/16]",
    max: "max-w-[260px]",
  },
  {
    id: "16:9",
    name: "Landscape",
    dimensions: "1920 × 1080",
    aspect: "aspect-video",
    max: "max-w-[600px]",
  },
];

export function CreativePanel() {
  const [propertyId, setPropertyId] = useState(PROPERTIES[0]!.id);
  const [formatId, setFormatId] = useState<Format>("4:5");
  const property = PROPERTIES.find((item) => item.id === propertyId)!;
  const format = FORMATS.find((item) => item.id === formatId)!;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[190px_minmax(0,1fr)_310px]">
      <aside className="rounded-xl border bg-card p-3">
        <h3 className="px-2 text-xs font-semibold">Starting properties</h3>
        <div
          className="mt-2 space-y-2"
          role="group"
          aria-label="Select a starting property"
        >
          {PROPERTIES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPropertyId(item.id)}
              aria-pressed={propertyId === item.id}
              className={cn(
                "w-full rounded-lg border p-2 text-left transition-colors",
                propertyId === item.id
                  ? "border-foreground bg-muted"
                  : "border-transparent hover:bg-muted/60",
              )}
            >
              <span className="text-xs font-semibold">{item.name}</span>
              <span className="block text-[10px] text-muted-foreground">
                2 ads · 8 assets
              </span>
            </button>
          ))}
        </div>
        <p className="mt-4 border-t px-2 pt-4 text-[11px] leading-5 text-muted-foreground">
          <ShieldCheck className="mr-1 inline size-3" />
          Client-selected homes only. Changing selection would require
          rebuilding affected ads.
        </p>
      </aside>

      <section className="min-w-0 rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">{property.name} · Static ad</h3>
            <p className="text-xs text-muted-foreground">
              Illustrative creative · Ready for visual review
            </p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">
            4 sizes ready
          </span>
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
              shape="round"
              onClick={() => setFormatId(item.id)}
              aria-pressed={formatId === item.id}
            >
              {item.id}
              <span className="hidden sm:inline">· {item.name}</span>
            </Button>
          ))}
        </div>
        <div className="mt-4 flex min-h-[430px] items-center justify-center overflow-hidden rounded-xl bg-muted/40 p-4">
          <div
            className={cn(
              "relative flex w-full flex-col justify-between overflow-hidden rounded-sm bg-gradient-to-br p-5 text-white shadow-lg",
              property.palette,
              format.aspect,
              format.max,
            )}
          >
            <div>
              <span className="rounded bg-black/55 px-2 py-1 text-[9px] font-bold tracking-wider">
                ILLUSTRATIVE · DEMO
              </span>
              <p className="mt-3 text-[10px] font-medium drop-shadow">
                DESERT HOUSE CO. · FICTIONAL
              </p>
            </div>
            <div className="-mx-5 -mb-5 bg-gradient-to-t from-black/90 via-black/65 to-transparent px-5 pt-16 pb-5">
              <p className="text-xs font-semibold">{property.name}</p>
              <p className="mt-1 text-xl leading-tight font-semibold sm:text-2xl">
                A little more room to unwind.
              </p>
              <p className="mt-2 text-[10px]">
                {property.facts} · Demo property
              </p>
            </div>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1 text-xs text-emerald-600">
          <CheckCircle2 className="size-3" />
          Illustrative safe-area and text checks complete · {
            format.dimensions
          }{" "}
          · {format.name}
        </p>
      </section>

      <aside className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold">Ad-specific copy</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          All fields are fictional and illustrative.
        </p>
        <dl className="mt-5 space-y-4 text-xs">
          <CopyField label="Primary text" value={property.copy.primary} />
          <CopyField label="Headline" value={property.copy.headline} />
          <CopyField label="Description" value={property.copy.description} />
          <CopyField label="CTA / call to action" value="See details" />
          <CopyField label="Destination" value={property.copy.destination} />
        </dl>
        <div className="mt-5 rounded-lg border bg-muted/40 p-3 text-[11px] leading-5 text-muted-foreground">
          <ShieldCheck className="mr-1 inline size-3" />
          Use real approved property assets and verified features in production.
          These visual treatments, properties, copy, and links are illustrative.
        </div>
      </aside>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="mb-1.5 font-medium text-muted-foreground">{label}</dt>
      <dd className="rounded-lg border bg-muted/30 p-3 leading-5 break-words">
        {value}
      </dd>
    </div>
  );
}
