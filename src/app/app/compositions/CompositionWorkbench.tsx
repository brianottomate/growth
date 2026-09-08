"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Expand,
  ExternalLink,
  ImageIcon,
  Layers3,
  Loader2,
  Snowflake,
  Star,
  Wand2,
} from "lucide-react";

import {
  COMPOSITION_FORMATS,
  COMPOSITION_TEMPLATES,
  getCompositionFields,
  type CompositionFieldKey,
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
import { ListingSamplesDialog } from "./ListingSamplesDialog";
import { SiteImagesDialog } from "./SiteImagesDialog";

type Brand = {
  id: string;
  name: string;
  slug: string | null;
  logo: string | null;
  brandIdentity: BrandIdentity | null;
};

/** The colour a brand's cards get when nobody picks one: the renderer's rule. */
function brandAccent(identity: BrandIdentity | null | undefined) {
  return identity?.colors?.accent ?? identity?.colors?.primary ?? "#18a8b5";
}

/** The brand's own colours, deduplicated, for the accent swatches. */
function brandPalette(identity: BrandIdentity | null | undefined) {
  const colors = identity?.colors ?? {};
  const seen = new Set<string>();
  return (
    [
      ["Accent", colors.accent],
      ["Primary", colors.primary],
      ["Secondary", colors.secondary],
      ["Background", (colors as { background?: string }).background],
    ] as const
  ).flatMap(([label, hex]) => {
    if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return [];
    const key = hex.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ label, hex: key }];
  });
}

type Direction = { verdict: "keep" | "adjust"; note: string; changes: string[] };

/** Where the crop leans, as the focal point the renderer keeps in frame. */
const CROP_PRESETS = {
  center: null,
  left: { x: 0, y: 50 },
  right: { x: 100, y: 50 },
  top: { x: 50, y: 0 },
  bottom: { x: 50, y: 100 },
} as const satisfies Record<string, { x: number; y: number } | null>;
type CropPreset = keyof typeof CROP_PRESETS;

export function CompositionWorkbench({
  brands,
  brandId,
  onBrandChange,
  openAssetId = null,
  replaceTarget = null,
}: {
  brands: Brand[];
  brandId: string;
  onBrandChange: (brandId: string) => void;
  /** A frozen card to reopen with its spec in the form. */
  openAssetId?: string | null;
  /** The ad card the reopened composition came from; a freeze goes back there. */
  replaceTarget?: { adId: string; index: number; back: string | null } | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [templateId, setTemplateId] =
    useState<CompositionTemplateId>("photo-only");
  const [formatId, setFormatId] = useState<CompositionFormatId>("portrait");
  const [sourceMediaAssetId, setSourceMediaAssetId] = useState("");
  // Copy lives outside the blueprint: switching layouts keeps it, and a field
  // reappears with its text when a layout uses it again.
  const [title, setTitle] = useState("The view is only the beginning.");
  const [subtitle, setSubtitle] = useState(
    "Turn a strong property image into channel-ready creative without rebuilding the layout.",
  );
  const [eyebrow, setEyebrow] = useState("Stay with Wander");
  const [cta, setCta] = useState("Explore the stay");
  const [rating, setRating] = useState<number | undefined>(5);
  const [assetTitle, setAssetTitle] = useState("Wander social composition");
  const [sourceSearch, setSourceSearch] = useState("");
  const [mark, setMark] = useState<"auto" | "color" | "white" | "dark" | "none">("auto");
  // The crop is a focal point: the point of the photo that must stay in
  // frame. A landscape photo on a portrait canvas loses its sides, a portrait
  // one on a square loses top and bottom, and one control has to cover both.
  const imagePosition = "center" as const;
  // What the art director set. Cleared when the photo or the layout changes,
  // because the read belonged to that card.
  const [focal, setFocal] = useState<{ x: number; y: number } | null>(null);
  const [scrim, setScrim] = useState<string | null>(null);
  const [direction, setDirection] = useState<Direction | null>(null);

  // Reopening: the stored identity becomes the form, once, when it arrives.
  const reopened = useQuery({
    ...trpc.composition.open.queryOptions({ assetId: openAssetId ?? "" }),
    enabled: Boolean(openAssetId),
    staleTime: Infinity,
  });
  const [hydratedFrom, setHydratedFrom] = useState<string | null>(null);
  useEffect(() => {
    const data = reopened.data;
    if (!openAssetId || !data || hydratedFrom === openAssetId) return;
    const { spec: saved } = data;
    if (saved.brandId !== brandId) onBrandChange(saved.brandId);
    setTemplateId(saved.templateId);
    setFormatId(saved.formatId);
    setSourceMediaAssetId(saved.sourceMediaAssetId ?? "");
    setTitle(saved.title);
    setSubtitle(saved.subtitle ?? "");
    setEyebrow(saved.eyebrow ?? "");
    setCta(saved.cta ?? "");
    if (saved.accent) setAccent(saved.accent);
    setRating(saved.rating);
    setMark(saved.mark);
    setFocal(saved.focal ?? null);
    setScrim(saved.scrim ?? null);
    setAssetTitle(data.assetTitle);
    setDirection(
      data.direction
        ? {
            verdict: data.direction.verdict === "adjust" ? "adjust" : "keep",
            note: data.direction.note,
            changes: data.direction.changes,
          }
        : null,
    );
    setHydratedFrom(openAssetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reopened.data, openAssetId, hydratedFrom]);
  useEffect(() => {
    if (reopened.error) toast.error(reopened.error.message);
  }, [reopened.error]);

  const selectedBrand = brands.find((brand) => brand.id === brandId);
  const palette = useMemo(
    () => brandPalette(selectedBrand?.brandIdentity),
    [selectedBrand],
  );
  const [accent, setAccent] = useState(() =>
    brandAccent(selectedBrand?.brandIdentity),
  );
  // Switching brand resets the accent to that brand's own; a tweak made for
  // one brand should not leak onto the next.
  useEffect(() => {
    setAccent(brandAccent(selectedBrand?.brandIdentity));
  }, [selectedBrand]);

  const cropPreset: CropPreset | "custom" = !focal
    ? "center"
    : ((Object.keys(CROP_PRESETS) as CropPreset[]).find((key) => {
        const preset = CROP_PRESETS[key];
        return preset?.x === focal.x && preset?.y === focal.y;
      }) ?? "custom");

  const fields = getCompositionFields(templateId);
  const has = (key: CompositionFieldKey) =>
    fields.some((field) => field.key === key);

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
          Boolean(asset.url) &&
          // The brand mark's own renders live in the library too; they are
          // drawn onto cards, never used as the photo under one.
          (asset.metadata as { source?: string } | null)?.source !== "brand_mark",
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
  const needsTitle = has("title");
  const canRender = Boolean(
    (!needsTitle || title.trim()) && (!requiresImage || renderSourceId),
  );

  const resetDirection = () => {
    setFocal(null);
    setScrim(null);
    setDirection(null);
  };
  const chooseTemplate = (next: CompositionTemplateId) => {
    setTemplateId(next);
    resetDirection();
  };
  const chooseSource = (id: string) => {
    setSourceMediaAssetId(id);
    resetDirection();
  };

  // The spec as the renderer will read it: only the fields this blueprint
  // declares travel, so a hidden field cannot leak onto the canvas.
  const spec = useMemo(
    () => ({
      brandId,
      templateId,
      formatId,
      sourceMediaAssetId: renderSourceId || undefined,
      title: needsTitle ? title.trim() : "",
      subtitle: has("subtitle") && subtitle.trim() ? subtitle.trim() : undefined,
      eyebrow: has("eyebrow") && eyebrow.trim() ? eyebrow.trim() : undefined,
      cta: has("cta") && cta.trim() ? cta.trim() : undefined,
      accent: has("accent") ? accent : undefined,
      rating: has("rating") ? rating : undefined,
      mark: has("mark") ? mark : ("auto" as const),
      imagePosition,
      focal: focal ?? undefined,
      scrim: scrim ?? undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brandId, templateId, formatId, renderSourceId, title, subtitle, eyebrow, cta, accent, rating, mark, imagePosition, focal, scrim, fields],
  );

  const previewUrl = useMemo(() => {
    if (!canRender) return null;
    const params = new URLSearchParams({
      brandId,
      templateId,
      formatId,
      title: spec.title,
      imagePosition,
      mark: spec.mark,
    });
    if (spec.sourceMediaAssetId) params.set("sourceMediaAssetId", spec.sourceMediaAssetId);
    if (spec.subtitle) params.set("subtitle", spec.subtitle);
    if (spec.eyebrow) params.set("eyebrow", spec.eyebrow);
    if (spec.cta) params.set("cta", spec.cta);
    if (spec.accent) params.set("accent", spec.accent);
    if (spec.rating) params.set("rating", String(spec.rating));
    if (spec.focal) {
      params.set("focalX", String(spec.focal.x));
      params.set("focalY", String(spec.focal.y));
    }
    if (spec.scrim) params.set("scrim", spec.scrim);
    return `/api/compositions/preview?${params.toString()}`;
  }, [brandId, canRender, formatId, imagePosition, spec, templateId]);

  const replaceCard = useMutation(
    trpc.ads.replaceAdMedia.mutationOptions({
      onSuccess: () => {
        toast.success(
          replaceTarget?.back ? (
            <span>
              Card {replaceTarget.index + 1} replaced on the ad.{" "}
              <Link href={replaceTarget.back} className="underline">
                Back to the campaign
              </Link>
            </span>
          ) : (
            "Card replaced on the ad"
          ),
        );
      },
      onError: (error) => toast.error(`Frozen, but not put on the ad: ${error.message}`),
    }),
  );
  const freeze = useMutation(
    trpc.composition.freeze.mutationOptions({
      onSuccess: async (asset) => {
        if (replaceTarget) {
          replaceCard.mutate({
            adId: replaceTarget.adId,
            index: replaceTarget.index,
            mediaAssetId: asset.id,
          });
        } else {
          toast.success("Frozen into the media library");
        }
        await queryClient.invalidateQueries({
          queryKey: sourceListOptions.queryKey,
        });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const direct = useMutation(
    trpc.composition.direct.mutationOptions({
      onSuccess: async (result) => {
        setTitle(result.title);
        if (has("subtitle")) setSubtitle(result.subtitle ?? "");
        setFocal(result.focal);
        setScrim(result.scrim);
        if (result.sourceMediaAssetId) {
          // The director had the photo extended; the new one is in the
          // library and the card now starts from it.
          await queryClient.invalidateQueries({
            queryKey: sourceListOptions.queryKey,
          });
          setSourceMediaAssetId(result.sourceMediaAssetId);
        }
        setDirection({
          verdict: result.verdict,
          note: result.note,
          changes: result.changes,
        });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const extend = useMutation(
    trpc.composition.extend.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({
          queryKey: sourceListOptions.queryKey,
        });
        chooseSource(result.id);
        toast.success(
          result.reused
            ? "Already extended once; switched to that photo"
            : `Photo extended ${result.axis === "vertical" ? "above and below" : "to both sides"}`,
        );
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
  const identity = selectedBrand?.brandIdentity ?? null;
  const fonts = identity?.fonts ?? [];
  const headingFont =
    fonts.find((font) => font.role === "heading")?.family ?? fonts[0]?.family;
  const bodyFont = fonts.find((font) => font.role === "body")?.family;

  return (
    <div className="grid gap-6 2xl:grid-cols-[440px_minmax(0,1fr)]">
      <div className="space-y-5">
        {openAssetId ? (
          <div className="bg-muted/40 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs">
            <span>
              {reopened.isLoading
                ? "Opening the card…"
                : replaceTarget
                  ? `Editing card ${replaceTarget.index + 1} of an ad. Freezing puts the new render in its place.`
                  : "Reopened from the library. Freezing makes a new card; the old one stays."}
            </span>
            {replaceTarget?.back ? (
              <Link href={replaceTarget.back} className="text-primary shrink-0 hover:underline">
                Back to the campaign
              </Link>
            ) : null}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Brand</Label>
            <SimpleSelect
              value={brandId}
              onValueChange={(nextBrandId) => {
                onBrandChange(nextBrandId);
                setSourceMediaAssetId("");
                resetDirection();
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
              onValueChange={(value) => {
                setFormatId(value as CompositionFormatId);
                resetDirection();
              }}
              options={COMPOSITION_FORMATS.map((format) => ({
                value: format.id,
                label: `${format.label} · ${format.detail}`,
              }))}
              className="w-full"
            />
          </div>
        </div>

        {/* Brand truth, read-only. It is edited on the brand page; the Studio
            only shows what it is composing with. */}
        <section className="space-y-2 rounded-xl border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs">
              <span className="font-semibold">Brand defaults</span>{" "}
              <span className="text-muted-foreground">read from the brand page</span>
            </p>
            {selectedBrand?.slug ? (
              <Link
                href={`/app/brands/${selectedBrand.slug}`}
                className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
              >
                Edit on {selectedBrand.name}
                <ExternalLink className="size-3" />
              </Link>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {selectedBrand?.logo ? (
              <span className="inline-flex h-7 items-center rounded-md border bg-white px-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selectedBrand.logo} alt="" className="max-h-4 max-w-28 object-contain" />
              </span>
            ) : null}
            {palette.length > 0 ? (
              <span className="flex items-center gap-1">
                {palette.map((swatch) => (
                  <span
                    key={swatch.hex}
                    title={`${swatch.label} ${swatch.hex}`}
                    className="size-4 rounded-full border border-white/20"
                    style={{ background: swatch.hex }}
                  />
                ))}
              </span>
            ) : null}
            {identity?.colorScheme ? (
              <span className="capitalize">{identity.colorScheme}</span>
            ) : null}
            {headingFont ? (
              <span>
                {headingFont}
                {bodyFont && bodyFont !== headingFont ? ` / ${bodyFont}` : ""}
              </span>
            ) : null}
            {!selectedBrand?.logo && palette.length === 0 && !headingFont ? (
              <span className="text-muted-foreground">
                Nothing read yet. Re-enrich on the brand page.
              </span>
            ) : null}
          </div>
          {identity?.personality ? (
            <p className="text-muted-foreground text-[11px]">
              {[identity.personality.tone, identity.personality.energy, identity.personality.targetAudience]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </section>

        <section className="space-y-3 rounded-xl border p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="flex items-center gap-2 text-sm">
              <Layers3 className="size-4" />
              <span className="font-semibold">Blueprint</span>
              <span className="text-muted-foreground text-xs">
                decides which fields exist below
              </span>
            </p>
            <Badge variant="outline">v{selectedTemplate.version}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {COMPOSITION_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => chooseTemplate(template.id)}
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

        <section className="space-y-4 rounded-xl border p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{selectedTemplate.label}</span>
            <Badge variant="outline">
              {fields.length} field{fields.length === 1 ? "" : "s"}
            </Badge>
            {fields.length === 0 ? (
              <span className="text-muted-foreground text-xs">
                draws the photo and nothing else
              </span>
            ) : null}
          </div>

          {fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label className="flex items-center gap-2">
                {field.label}
                {field.hint && field.key === "accent" ? (
                  <span className="text-muted-foreground font-normal">{field.hint}</span>
                ) : null}
              </Label>
              {field.key === "mark" ? (
                <SimpleSelect
                  value={mark}
                  onValueChange={(value) => setMark(value as typeof mark)}
                  options={[
                    { value: "auto", label: "Brand default · white over photos" },
                    { value: "color", label: "Colour" },
                    { value: "white", label: "White" },
                    { value: "dark", label: "Dark" },
                    { value: "none", label: "No mark" },
                  ]}
                  className="w-full"
                />
              ) : field.key === "eyebrow" ? (
                <Input
                  value={eyebrow}
                  onChange={(event) => setEyebrow(event.target.value)}
                  maxLength={40}
                  placeholder={field.hint}
                />
              ) : field.key === "title" ? (
                <Textarea
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                  rows={2}
                  placeholder={field.hint}
                />
              ) : field.key === "subtitle" ? (
                <Textarea
                  value={subtitle}
                  onChange={(event) => setSubtitle(event.target.value)}
                  maxLength={220}
                  rows={2}
                  placeholder={field.hint}
                />
              ) : field.key === "cta" ? (
                <Input
                  value={cta}
                  onChange={(event) => setCta(event.target.value)}
                  maxLength={60}
                  placeholder={field.hint}
                />
              ) : field.key === "rating" && templateId === "catalog-place" ? (
                <Input
                  type="number"
                  min={1}
                  max={5}
                  step={0.1}
                  value={rating ?? ""}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setRating(event.target.value === "" || Number.isNaN(next) ? undefined : Math.round(next * 10) / 10);
                  }}
                  placeholder={field.hint}
                  className="w-28"
                />
              ) : field.key === "rating" ? (
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(rating === n ? undefined : n)}
                      aria-label={`${n} star${n === 1 ? "" : "s"}`}
                      className="p-0.5"
                    >
                      <Star
                        className={cn(
                          "size-5",
                          rating && n <= rating
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground",
                        )}
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {palette.map((swatch) => (
                    <button
                      key={swatch.hex}
                      type="button"
                      title={`${swatch.label} ${swatch.hex}`}
                      onClick={() => setAccent(swatch.hex)}
                      className={cn(
                        "size-7 rounded-full border-2 transition",
                        accent.toLowerCase() === swatch.hex
                          ? "border-white"
                          : "border-transparent hover:border-white/40",
                      )}
                      style={{ background: swatch.hex }}
                    />
                  ))}
                  <Input
                    type="color"
                    value={accent}
                    onChange={(event) => setAccent(event.target.value)}
                    className="h-7 w-10 p-0.5"
                    title="Custom"
                  />
                </div>
              )}
            </div>
          ))}

          {direction ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-[11px] leading-4">
              <span className="font-medium">Art director:</span> {direction.note}
              {direction.changes.length > 0 ? ` Applied: ${direction.changes.join("; ")}.` : ""}
            </p>
          ) : null}

          <p className="text-muted-foreground text-[11px]">
            Copy is kept when you switch blueprints. It reappears when a layout
            uses it.
          </p>
        </section>
      </div>

      <div className="space-y-5">
        <section className="rounded-xl border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <span className="font-semibold">Source media</span>{" "}
              <span className="text-muted-foreground text-xs">
                from this brand&apos;s media library
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <ListingSamplesDialog
                brandId={brandId}
                onImported={async (imported) => {
                  await queryClient.invalidateQueries({
                    queryKey: sourceListOptions.queryKey,
                  });
                  if (imported[0]) chooseSource(imported[0].id);
                }}
              />
              <SiteImagesDialog
                brandId={brandId}
                onImported={async (imported) => {
                  await queryClient.invalidateQueries({
                    queryKey: sourceListOptions.queryKey,
                  });
                  if (imported[0]) chooseSource(imported[0].id);
                }}
              />
              <Input
                value={sourceSearch}
                onChange={(event) => setSourceSearch(event.target.value)}
                placeholder="Search library"
                className="h-8 w-40"
              />
              {requiresImage && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={!renderSourceId || extend.isPending}
                  onClick={() =>
                    extend.mutate({
                      brandId,
                      sourceMediaAssetId: renderSourceId,
                      formatId,
                      title: title.trim() || undefined,
                    })
                  }
                  title="Paint more of the scene in so the photo fills this canvas without cropping"
                >
                  <Expand className={cn("size-3.5", extend.isPending && "animate-pulse")} />
                  {extend.isPending ? "Extending…" : "Extend to canvas"}
                </Button>
              )}
              {requiresImage && (
                <SimpleSelect
                  value={cropPreset}
                  onValueChange={(value) => {
                    const preset = CROP_PRESETS[value as CropPreset];
                    setFocal(preset ? { ...preset } : null);
                    setDirection(null);
                  }}
                  options={[
                    { value: "center", label: "Crop toward centre" },
                    { value: "left", label: "Crop toward left" },
                    { value: "right", label: "Crop toward right" },
                    { value: "top", label: "Crop toward top" },
                    { value: "bottom", label: "Crop toward bottom" },
                    ...(cropPreset === "custom"
                      ? [{ value: "custom", label: `Art director's point (${focal?.x}%, ${focal?.y}%)` }]
                      : []),
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
              Nothing in the library yet. Pull a few from their homes, or upload in Media.
            </div>
          ) : (
            <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6">
              {hostedAssets.slice(0, 30).map((asset) => {
                const selected = renderSourceId === asset.id;
                return (
                  <button
                    type="button"
                    key={asset.id}
                    onClick={() => chooseSource(asset.id)}
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
            <p className="text-sm">
              <span className="font-semibold">Live composition</span>{" "}
              <span className="text-muted-foreground text-xs">
                {selectedFormat.width}×{selectedFormat.height} PNG
              </span>
            </p>
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
                {needsTitle && !title.trim()
                  ? `Add a ${fields.find((f) => f.key === "title")?.label.toLowerCase() ?? "headline"} to render this blueprint.`
                  : "Choose a source image to render this blueprint."}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center">
            <Label className="whitespace-nowrap">Library asset name</Label>
            <Input
              value={assetTitle}
              onChange={(event) => setAssetTitle(event.target.value)}
              maxLength={180}
              className="flex-1"
            />
            {requiresImage && fields.length > 0 ? (
              <Button
                variant="outline"
                disabled={!canRender || direct.isPending || freeze.isPending}
                onClick={() => direct.mutate(spec)}
                title="Have the art director judge this card and apply its corrections to the form"
              >
                <Wand2 className={cn("size-4", direct.isPending && "animate-pulse")} />
                {direct.isPending ? "Judging…" : direction ? "Judge again" : "Art director"}
              </Button>
            ) : null}
            <Button
              disabled={!canRender || !assetTitle.trim()}
              loading={freeze.isPending || replaceCard.isPending}
              onClick={() =>
                freeze.mutate({ ...spec, assetTitle: assetTitle.trim() })
              }
            >
              <Snowflake className="size-4" />
              {replaceTarget ? `Freeze and put on card ${replaceTarget.index + 1}` : "Freeze to library"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
