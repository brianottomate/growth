"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImageIcon, Layers3, Loader2, Snowflake } from "lucide-react";

import {
  COMPOSITION_FORMATS,
  COMPOSITION_TEMPLATES,
  type CompositionFormatId,
  type CompositionTemplateId,
} from "@/lib/compositions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { cn } from "@/components/ui/lib/utils";
import type { BrandIdentity } from "@/server/db/brand-schema";
import { useTRPC } from "@/trpc/react";

type Brand = {
  id: string;
  name: string;
  logo: string | null;
  brandIdentity: BrandIdentity | null;
};

/** The colour a brand's cards get when nobody picks one: the renderer's rule. */
function brandAccent(identity: BrandIdentity | null | undefined) {
  return identity?.colors?.accent ?? identity?.colors?.primary ?? "#18a8b5";
}

export function CompositionWorkbench({
  brands,
  brandId,
  onBrandChange,
}: {
  brands: Brand[];
  brandId: string;
  onBrandChange: (brandId: string) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [templateId, setTemplateId] =
    useState<CompositionTemplateId>("photo-only");
  const [formatId, setFormatId] = useState<CompositionFormatId>("portrait");
  const [sourceMediaAssetId, setSourceMediaAssetId] = useState("");
  const [title, setTitle] = useState("The view is only the beginning.");
  const [subtitle, setSubtitle] = useState(
    "Turn a strong property image into channel-ready creative without rebuilding the layout.",
  );
  const [eyebrow, setEyebrow] = useState("Stay with Wander");
  const [cta, setCta] = useState("Explore the stay");
  const [assetTitle, setAssetTitle] = useState("Wander social composition");
  const [sourceSearch, setSourceSearch] = useState("");
  const selectedBrand = brands.find((brand) => brand.id === brandId);
  const [accent, setAccent] = useState(() =>
    brandAccent(selectedBrand?.brandIdentity),
  );
  // Switching brand resets the accent to that brand's own; a tweak made for
  // one brand should not leak onto the next.
  useEffect(() => {
    setAccent(brandAccent(selectedBrand?.brandIdentity));
  }, [selectedBrand]);
  const [imagePosition, setImagePosition] = useState<
    "top" | "center" | "bottom"
  >("center");

  const sourceListOptions = trpc.media.list.queryOptions({
    brandId,
    kind: "image",
    ...(sourceSearch.trim() ? { query: sourceSearch.trim() } : {}),
  });
  const { data: assets, isLoading } = useQuery(sourceListOptions);
  const hostedAssets = useMemo(
    () =>
      (assets ?? []).filter(
        (asset) =>
          asset.provider === "r2" &&
          asset.status === "ready" &&
          Boolean(asset.url),
      ),
    [assets],
  );
  const effectiveSourceId = hostedAssets.some(
    (asset) => asset.id === sourceMediaAssetId,
  )
    ? sourceMediaAssetId
    : (hostedAssets[0]?.id ?? "");
  const requiresImage = templateId !== "brand-statement";
  const renderSourceId = requiresImage ? effectiveSourceId : "";
  const canRender = Boolean(
    title.trim() && (!requiresImage || renderSourceId),
  );

  const previewUrl = useMemo(() => {
    if (!canRender) return null;
    const params = new URLSearchParams({
      brandId,
      templateId,
      formatId,
      title: title.trim(),
      imagePosition,
    });
    if (renderSourceId) {
      params.set("sourceMediaAssetId", renderSourceId);
    }
    if (subtitle.trim()) params.set("subtitle", subtitle.trim());
    if (eyebrow.trim()) params.set("eyebrow", eyebrow.trim());
    if (cta.trim()) params.set("cta", cta.trim());
    if (accent) params.set("accent", accent);
    return `/api/compositions/preview?${params.toString()}`;
  }, [
    accent,
    brandId,
    canRender,
    cta,
    renderSourceId,
    eyebrow,
    formatId,
    imagePosition,
    subtitle,
    templateId,
    title,
  ]);

  const freeze = useMutation(
    trpc.composition.freeze.mutationOptions({
      onSuccess: async () => {
        toast.success("Frozen into the media library");
        await queryClient.invalidateQueries({
          queryKey: sourceListOptions.queryKey,
        });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const selectedFormat = COMPOSITION_FORMATS.find(
    (format) => format.id === formatId,
  )!;
  const selectedTemplate = COMPOSITION_TEMPLATES.find(
    (template) => template.id === templateId,
  )!;

  return (
    <div className="grid gap-6 2xl:grid-cols-[420px_minmax(0,1fr)]">
      <div className="space-y-5">
        <section className="space-y-4 rounded-xl border p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Brand</Label>
              <SimpleSelect
                value={brandId}
                onValueChange={(nextBrandId) => {
                  onBrandChange(nextBrandId);
                  setSourceMediaAssetId("");
                }}
                options={brands.map((brand) => ({
                  value: brand.id,
                  label: brand.name,
                }))}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Canvas</Label>
              <SimpleSelect
                value={formatId}
                onValueChange={(value) =>
                  setFormatId(value as CompositionFormatId)
                }
                options={COMPOSITION_FORMATS.map((format) => ({
                  value: format.id,
                  label: `${format.label} · ${format.detail}`,
                }))}
                className="w-full"
              />
            </div>
          </div>

          <BrandDefaults
            logo={selectedBrand?.logo ?? null}
            identity={selectedBrand?.brandIdentity ?? null}
          />

          <div className="space-y-1.5">
            <Label>Eyebrow</Label>
            <Input
              value={eyebrow}
              onChange={(event) => setEyebrow(event.target.value)}
              maxLength={40}
              placeholder="Optional category or campaign"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Headline</Label>
            <Textarea
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Supporting copy</Label>
            <Textarea
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              maxLength={220}
              rows={3}
              placeholder="Optional"
            />
          </div>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <div className="space-y-1.5">
              <Label>CTA</Label>
              <Input
                value={cta}
                onChange={(event) => setCta(event.target.value)}
                maxLength={60}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Accent</Label>
              <Input
                type="color"
                value={accent}
                onChange={(event) => setAccent(event.target.value)}
                className="w-full p-1"
              />
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Layers3 className="size-4" />
                Blueprint
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Choose the reusable layout before adding copy and media.
              </p>
            </div>
            <Badge variant="outline">v{selectedTemplate.version}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {COMPOSITION_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setTemplateId(template.id)}
                className={cn(
                  "hover:bg-muted/70 relative rounded-lg border p-3 text-left transition-colors",
                  templateId === template.id &&
                    "border-primary bg-primary/5 ring-primary/20 ring-2",
                )}
              >
                {templateId === template.id && (
                  <Check className="text-primary absolute top-2 right-2 size-3.5" />
                )}
                <span className="block pr-4 text-xs font-semibold">
                  {template.label}
                </span>
                <span className="text-muted-foreground mt-1 block text-[11px] leading-4">
                  {template.description}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="space-y-5">
        <section className="rounded-xl border p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Source media</h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Pick a ready image from this brand&apos;s R2 media library.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                value={sourceSearch}
                onChange={(event) => setSourceSearch(event.target.value)}
                placeholder="Search library"
                className="h-8 w-44"
              />
              {requiresImage && (
                <SimpleSelect
                  value={imagePosition}
                  onValueChange={(value) =>
                    setImagePosition(value as typeof imagePosition)
                  }
                  options={[
                    { value: "top", label: "Crop from top" },
                    { value: "center", label: "Crop from center" },
                    { value: "bottom", label: "Crop from bottom" },
                  ]}
                  size="sm"
                />
              )}
            </div>
          </div>

          {!requiresImage ? (
            <div className="text-muted-foreground flex h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-xs">
              <Layers3 className="size-5" />
              Brand statement uses brand and copy without a source image.
            </div>
          ) : isLoading ? (
            <div className="text-muted-foreground flex h-28 items-center justify-center gap-2 text-xs">
              <Loader2 className="size-4 animate-spin" />
              Loading images
            </div>
          ) : hostedAssets.length === 0 ? (
            <div className="text-muted-foreground flex h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-xs">
              <ImageIcon className="size-5" />
              Upload an image in Media to use image-led blueprints.
            </div>
          ) : (
            <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6">
              {hostedAssets.slice(0, 30).map((asset) => {
                const selected = renderSourceId === asset.id;
                return (
                  <button
                    type="button"
                    key={asset.id}
                    onClick={() => setSourceMediaAssetId(asset.id)}
                    className={cn(
                      "bg-muted relative aspect-square overflow-hidden rounded-lg border",
                      selected &&
                        "border-primary ring-primary/30 ring-2 ring-offset-1",
                    )}
                    title={asset.title ?? asset.filename ?? "Library image"}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.thumbnailUrl ?? asset.url!}
                      alt={asset.alt ?? asset.title ?? ""}
                      loading="lazy"
                      className="absolute inset-0 size-full object-cover"
                    />
                    {selected && (
                      <span className="bg-primary text-primary-foreground absolute top-1 right-1 flex size-5 items-center justify-center rounded-full">
                        <Check className="size-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border">
          <div className="bg-muted/30 flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Live composition</h2>
              <p className="text-muted-foreground text-xs">
                {selectedFormat.width}×{selectedFormat.height} PNG
              </p>
            </div>
            <Badge variant="secondary">{selectedTemplate.label}</Badge>
          </div>
          <div className="flex min-h-96 items-center justify-center bg-[radial-gradient(circle_at_center,var(--color-muted)_1px,transparent_1px)] bg-size-[16px_16px] p-5">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Composition preview"
                className="max-h-[680px] max-w-full rounded-md object-contain shadow-2xl"
              />
            ) : (
              <div className="text-muted-foreground flex flex-col items-center gap-2 text-sm">
                <ImageIcon className="size-6" />
                {title.trim()
                  ? "Choose a source image to render this blueprint."
                  : "Add a headline to render this blueprint."}
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label>Library asset name</Label>
            <Input
              value={assetTitle}
              onChange={(event) => setAssetTitle(event.target.value)}
              maxLength={180}
            />
            <p className="text-muted-foreground text-[11px]">
              Freezing saves the exact PNG and its complete blueprint recipe.
            </p>
          </div>
          <Button
            disabled={!canRender || !assetTitle.trim()}
            loading={freeze.isPending}
            onClick={() =>
              freeze.mutate({
                brandId,
                templateId,
                formatId,
                sourceMediaAssetId: renderSourceId || undefined,
                title: title.trim(),
                subtitle: subtitle.trim() || undefined,
                eyebrow: eyebrow.trim() || undefined,
                cta: cta.trim() || undefined,
                accent,
                imagePosition,
                assetTitle: assetTitle.trim(),
              })
            }
          >
            <Snowflake className="size-4" />
            Freeze to library
          </Button>
        </section>
      </div>
    </div>
  );
}

/**
 * What enrichment learned about the brand, read-only. The accent above starts
 * from it; the rest is here so the operator can see what the site says before
 * overriding it.
 */
function BrandDefaults({
  logo,
  identity,
}: {
  logo: string | null;
  identity: BrandIdentity | null;
}) {
  const swatches = (
    [
      ["Primary", identity?.colors?.primary],
      ["Secondary", identity?.colors?.secondary],
      ["Accent", identity?.colors?.accent],
    ] as const
  ).flatMap(([label, value]) => (value ? [[label, value] as const] : []));
  const fonts = identity?.fonts ?? [];

  if (!identity && !logo) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-[11px] leading-4">
        No brand defaults yet. Enrich from website on the brand card reads the
        logo, colours and fonts from their site.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">Brand defaults</span>
        {identity?.personality && (
          <span className="text-muted-foreground text-[11px]">
            {identity.personality.tone} · {identity.personality.energy} energy
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {logo ? (
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="" className="max-h-8 max-w-8 object-contain" />
          </span>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {swatches.map(([label, value]) => (
            <span
              key={label}
              className="flex items-center gap-1.5 text-[11px]"
              title={`${label} ${value}`}
            >
              <span
                className="size-3.5 rounded-sm border"
                style={{ background: value }}
              />
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono">{value}</span>
            </span>
          ))}
          {swatches.length === 0 && (
            <span className="text-muted-foreground text-[11px]">
              No colours found on the site.
            </span>
          )}
        </div>
      </div>
      {fonts.length > 0 && (
        <p className="text-muted-foreground text-[11px]">
          Fonts:{" "}
          {fonts
            .map((font) => (font.role ? `${font.family} (${font.role})` : font.family))
            .join(", ")}
          . Cards render in the house typeface for now.
        </p>
      )}
    </div>
  );
}
