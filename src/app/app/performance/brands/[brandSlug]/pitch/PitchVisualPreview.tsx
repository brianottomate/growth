"use client";

import { Button } from "@/components/ui/button";
import type { PitchAssetTarget } from "./PitchMediaPicker";
import { useState } from "react";
import type { PitchFields } from "@/lib/pitch-settings";

function Asset({
  url,
  label,
  cover = false,
}: {
  url: string;
  label: string;
  cover?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return url && !failed ? (
    <img
      src={url}
      alt={label}
      loading="lazy"
      onError={() => setFailed(true)}
      className={
        cover
          ? "h-full w-full object-cover"
          : "max-h-20 max-w-full object-contain"
      }
    />
  ) : (
    <span className="p-4 text-center text-xs text-muted-foreground">
      {failed
        ? `${label} could not load`
        : `No ${label.toLowerCase()} selected`}
    </span>
  );
}

export function PitchAsset({ url, label }: { url: string; label: string }) {
  return (
    <div className="space-y-2">
      <div className="flex h-24 items-center justify-center rounded-lg border bg-zinc-800 p-3">
        <Asset key={url} url={url} label={label} />
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-xs underline"
        >
          View original asset ↗
        </a>
      )}
    </div>
  );
}

export function PitchVisualPreview({
  fields,
  photos,
  editing,
  automaticPhotos,
  onChooseAsset,
}: {
  fields: PitchFields;
  photos: string[];
  editing: boolean;
  automaticPhotos: boolean;
  onChooseAsset?: (target: PitchAssetTarget) => void;
}) {
  const choose = (target: PitchAssetTarget, label: string) =>
    onChooseAsset ? (
      <Button size="sm" variant="outline" onClick={() => onChooseAsset(target)}>
        {label}
      </Button>
    ) : null;
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xl font-semibold">Pitch at a glance</h3>
        <p className="text-sm text-muted-foreground">
          {editing
            ? "Unsaved preview · save to update the live page and export."
            : "Saved copy and assets · a quick view of how they shape the pitch."}{" "}
          These frames illustrate the layout; the full preview below shows the
          actual page.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-2">
        <article className="overflow-hidden rounded-2xl border bg-card">
          <div className="relative min-h-72 overflow-hidden bg-zinc-900 text-white">
            {fields.heroMedia && (
              <div className="absolute inset-0">
                {fields.heroMedia.kind === "video" ? (
                  <video
                    src={fields.heroMedia.url}
                    muted
                    playsInline
                    controls
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Asset
                    key={fields.heroMedia.url}
                    url={fields.heroMedia.url}
                    label="Hero background"
                    cover
                  />
                )}
              </div>
            )}
            <div className="pointer-events-none relative min-h-72 space-y-4 bg-black/45 p-6">
              <p className="text-xs tracking-widest uppercase">
                Performance by Wander
              </p>
              <h4 className="text-3xl font-semibold">{fields.pageHeadline}</h4>
              <p className="text-sm text-white/85">{fields.pageSubtitle}</p>
              <p className="text-xs text-white/70">For {fields.brandName}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 p-3">
            {choose("hero", "Choose background")}{" "}
            {choose("logo", "Change logo")}
            <p className="text-xs text-muted-foreground">
              Page opening ·{" "}
              {fields.heroMedia
                ? "Selected hero background"
                : "Standard background on the live page"}
            </p>
          </div>
        </article>
        <article className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800 p-1">
              <Asset
                key={fields.iconUrl}
                url={fields.iconUrl}
                label="Brand icon"
              />
            </div>
            <div>
              <p className="text-sm font-medium">{fields.brandName}</p>
              <p className="text-xs text-muted-foreground">
                Sponsored · Sample ad
              </p>
            </div>
          </div>
          <p className="px-4 pb-4 text-sm">{fields.caption}</p>
          <div className="relative aspect-video bg-muted">
            <Asset
              key={photos[0] ?? ""}
              url={photos[0] ?? ""}
              label="Featured photo"
              cover
            />
            {photos[0] && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-white">
                <p className="text-lg font-semibold">{fields.headline}</p>
                {fields.location && (
                  <p className="text-xs">{fields.location}</p>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 p-4">
            <p className="text-sm font-medium">{fields.headline}</p>
            {choose("photos", "Choose photos")}
            <span className="rounded-lg border px-3 py-2 text-xs">
              Book now
            </span>
          </div>
        </article>
      </div>
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-3">
        <article className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex items-center gap-2 p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 p-1">
              <Asset
                key={fields.iconUrl}
                url={fields.iconUrl}
                label="Brand icon"
              />
            </div>
            <p className="text-xs font-medium">
              {fields.brandName} · Instagram
            </p>
          </div>
          <div className="aspect-square bg-muted">
            <Asset
              key={photos[1] ?? photos[0] ?? ""}
              url={photos[1] ?? photos[0] ?? ""}
              label="Instagram photo"
              cover
            />
          </div>
          <div className="space-y-2 p-3">
            <p className="text-sm">{fields.caption}</p>
            {choose("photos", "Choose photos")}
            {choose("icon", "Change icon")}
          </div>
        </article>
        <article className="overflow-hidden rounded-2xl border bg-card">
          <div className="border-b bg-muted p-3 text-xs text-muted-foreground">
            Email · Featured stay
          </div>
          <div className="flex h-20 items-center justify-center bg-zinc-800 p-3">
            <Asset
              key={fields.logoUrl}
              url={fields.logoUrl}
              label="Email logo"
            />
          </div>
          <div className="aspect-video bg-muted">
            <Asset
              key={photos[0] ?? ""}
              url={photos[0] ?? ""}
              label="Email photo"
              cover
            />
          </div>
          <div className="space-y-2 p-3">
            <h4 className="font-semibold">{fields.headline}</h4>
            <p className="text-sm text-muted-foreground">{fields.caption}</p>
            {choose("logo", "Change logo")}
            {choose("photos", "Choose photos")}
          </div>
        </article>
        <article className="overflow-hidden rounded-2xl border bg-card">
          <div className="border-b bg-muted p-3 text-xs text-muted-foreground">
            Booking site · Brand and imagery
          </div>
          <div className="flex h-20 items-center justify-center bg-zinc-800 p-3">
            <Asset
              key={fields.logoUrl}
              url={fields.logoUrl}
              label="Website logo"
            />
          </div>
          <div className="relative aspect-video bg-muted">
            <Asset
              key={photos[0] ?? ""}
              url={photos[0] ?? ""}
              label="Website photo"
              cover
            />
          </div>
          <div className="space-y-2 p-3">
            <h4 className="font-semibold">{fields.brandName}</h4>
            <p className="text-sm text-muted-foreground">
              {fields.location || "Location from selected homes"}
            </p>
            {choose("logo", "Change logo")}
            {choose("photos", "Choose photos")}
          </div>
        </article>
      </div>
      <div className="rounded-2xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-medium">Featured photos</h4>
          {choose("photos", "Choose photos")}
          <span className="text-xs text-muted-foreground">
            {automaticPhotos
              ? "Automatic · available photos from selected homes"
              : "Pitch selection · up to three photos"}
          </span>
        </div>
        {photos.length ? (
          <div className="grid grid-cols-1 gap-3 @xl:grid-cols-3">
            {photos.map((url, i) => (
              <div
                key={`${url}:${i}`}
                className="aspect-video overflow-hidden rounded-lg bg-muted"
              >
                <Asset
                  key={url}
                  url={url}
                  label={`Featured photo ${i + 1}`}
                  cover
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No home photos are available in Growth yet. The live page may
            discover photos from their booking site. Choose photos from the
            library or approve website suggestions to control the creative.
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Uploaded pitch images are saved in the brand’s media library under
          Pitch. The pitch stores references to those hosted assets.
        </p>
      </div>
    </section>
  );
}
