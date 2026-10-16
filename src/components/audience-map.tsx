"use client";

import { useId, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  audienceMapTarget,
  audienceMapCoverage,
  type AudienceGeography,
} from "@/lib/audience-map";
import { usStateCode } from "@/lib/us-states";
import maps from "@/lib/maps/audience-maps.json";

type MapAudience = {
  id: string;
  name: string;
  geography: AudienceGeography | null;
};
export function AudienceMap({
  audiences,
  context = "campaign",
  selection: controlledSelection,
  onSelectionChange,
}: {
  audiences: MapAudience[];
  context?: "campaign" | "persona" | "intent";
  selection?: string;
  onSelectionChange?: (selection: string) => void;
}) {
  const [selection, setSelection] = useState("all");
  const [view, setView] = useState<"us" | "world">(() =>
    audiences.some((a) => audienceMapTarget(a.geography).countries.has("US"))
      ? "us"
      : "world",
  );
  const [hover, setHover] = useState<string | null>(null);
  const labelId = useId();
  const chosen = controlledSelection ?? selection;
  const current = audiences.some((a) => a.id === chosen) ? chosen : "all";
  const selected =
    current === "all" ? audiences : audiences.filter((a) => a.id === current);
  const targets = selected.map((a) => audienceMapTarget(a.geography));
  const map = maps[view];
  const missingCountries =
    view === "world"
      ? [...new Set(targets.flatMap((t) => [...t.countries]))].filter(
          (code) => !maps.world.paths.some((p) => p.id === code),
        )
      : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Audience coverage</h3>
        <div className="flex gap-1" aria-label="Map view">
          {(["us", "world"] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={view === value ? "secondary" : "ghost"}
              aria-pressed={view === value}
              onClick={() => {
                setView(value);
                setHover(null);
              }}
            >
              {value === "us" ? "US" : "World"}
            </Button>
          ))}
        </div>
      </div>
      <label htmlFor={labelId} className="sr-only">
        Audience shown on map
      </label>
      <Select
        value={current}
        onValueChange={(value) => {
          setSelection(value);
          onSelectionChange?.(value);
          setHover(null);
        }}
      >
        <SelectTrigger id={labelId} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All audiences</SelectItem>
          {audiences.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <svg
        viewBox={map.viewBox}
        role="img"
        aria-label={`${view === "us" ? "United States" : "World"} ${context === "persona" ? "persona geography" : context === "intent" ? "intended geography" : "targeting coverage"} for ${current === "all" ? "all audiences" : selected[0]?.name}`}
        className="w-full"
        onMouseLeave={() => setHover(null)}
      >
        {map.paths.map((place) => {
          const id =
            view === "us" ? (usStateCode(place.name) ?? place.id) : place.id;
          const coverage = audienceMapCoverage(targets, view, id);
          const description = `${place.name}: ${coverage === "full" ? (context === "persona" ? "described geography" : context === "intent" ? "intended geography" : "targeted") : coverage === "partial" ? "selected locations only" : "not highlighted"}`;
          return (
            <path
              key={place.id}
              d={place.d ?? undefined}
              fill={
                coverage === "none"
                  ? "var(--color-muted)"
                  : "var(--color-foreground)"
              }
              fillOpacity={
                coverage === "partial" ? 0.55 : coverage === "full" ? 0.8 : 1
              }
              stroke="var(--color-background)"
              strokeWidth={0.8}
              vectorEffect="non-scaling-stroke"
              onMouseEnter={() => setHover(description)}
            >
              <title>{description}</title>
            </path>
          );
        })}
      </svg>
      <p className="min-h-5 text-xs text-muted-foreground" aria-live="polite">
        {hover ?? ""}
      </p>
      <div className="text-xs text-muted-foreground">
        <div className="flex flex-wrap gap-3">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-foreground opacity-80" />
            {context === "persona"
              ? "Described geography"
              : context === "intent"
                ? "Intended geography"
                : "Targeted"}
          </span>
          {(view === "world" ||
            targets.some((target) => target.cityStates.size > 0)) && (
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-foreground opacity-55" />
              Selected locations
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm border bg-muted" />
            Not highlighted
          </span>
        </div>
        {missingCountries.length > 0 && (
          <p className="mt-2">
            Country outlines unavailable: {missingCountries.join(", ")}.
          </p>
        )}
      </div>
    </div>
  );
}
