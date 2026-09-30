"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { cn } from "@/components/ui/lib/utils";
import type { BrandIdentity, BrandMark } from "@/server/db/schema";
import { orpc } from "@/orpc/client";

type Variants = { color: string; white: string; dark: string };
type Tuning = NonNullable<BrandMark["tuning"]>;
type IconChoice = "logo" | "logo-icon" | "favicon" | "none" | "library";
type FontChoice = "heading" | "body" | "house";

/**
 * The mark a brand's cards carry, shown three ways. "Suggest a mark" renders
 * every candidate at card size and lets the AI pick and save one; Edit opens
 * the lockup editor and the plain logo or favicon for anything by hand. Every
 * choice renders colour, white and dark variants, which is how a
 * brand-coloured mark stays legible on a photo.
 */
export function BrandMarkCard({
  brandId,
  brandName,
  logo,
  identity,
  mark,
  variants,
  photo,
  logoOnCreatives = true,
}: {
  brandId: string;
  brandName: string;
  logo: string | null;
  identity: BrandIdentity | null;
  mark: BrandMark | null;
  variants: Variants | null;
  /** A photo to preview the white mark over: the OG image or a hero. */
  photo: string | null;
  /** Whether new ad and catalog cards carry the mark; a card can still override it. */
  logoOnCreatives?: boolean;
}) {
  const router = useRouter();
  const [building, setBuilding] = useState(false);
  const [icon, setIcon] = useState<IconChoice>(logo ? "logo" : "none");
  const [iconAssetId, setIconAssetId] = useState<string>("");
  const [text, setText] = useState(brandName);
  const [font, setFont] = useState<FontChoice>("heading");
  const [tone, setTone] = useState<"color" | "white" | "dark">("color");
  // What "Fix with AI" returned for the lockup as currently edited. Any edit
  // to the recipe drops it: the correction belonged to the previous picture.
  const [tuning, setTuning] = useState<Tuning | null>(null);
  const editRecipe =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setTuning(null);
    };

  const fonts = identity?.fonts ?? [];
  const headingFont =
    fonts.find((f) => f.role === "heading")?.family ?? fonts[0]?.family ?? null;
  const bodyFont = fonts.find((f) => f.role === "body")?.family ?? null;
  const fontFamily =
    font === "heading" ? headingFont : font === "body" ? bodyFont : "";

  const library = useQuery({
    ...orpc.media.list.queryOptions({ input: { brandId, kind: "image" } }),
    enabled: building && icon === "library",
  });

  const previewUrl = useMemo(() => {
    if (!building) return null;
    if (icon === "library" && !iconAssetId) return null;
    const params = new URLSearchParams({ brandId, source: "lockup", tone });
    if (icon === "library") params.set("iconAssetId", iconAssetId);
    if (text.trim()) params.set("text", text.trim());
    if (fontFamily !== null) params.set("fontFamily", fontFamily);
    // Weight and tracking are set by the agent; the editor keeps them.
    if (mark?.fontWeight) params.set("fontWeight", String(mark.fontWeight));
    if (mark?.letterSpacing != null)
      params.set("letterSpacing", String(mark.letterSpacing));
    // A lockup with the site logo or favicon as its icon reuses those sources.
    if (icon === "logo" || icon === "logo-icon" || icon === "favicon")
      params.set("iconFrom", icon);
    if (tuning) {
      params.set("iconScale", String(tuning.iconScale));
      params.set("iconShift", String(tuning.iconShift));
      params.set("gapScale", String(tuning.gapScale));
    }
    return `/api/brands/mark-preview?${params.toString()}`;
  }, [
    brandId,
    building,
    fontFamily,
    icon,
    iconAssetId,
    mark?.fontWeight,
    mark?.letterSpacing,
    text,
    tone,
    tuning,
  ]);

  const recipe = {
    iconAssetId: icon === "library" ? iconAssetId : null,
    iconFrom:
      icon === "logo" || icon === "logo-icon" || icon === "favicon"
        ? icon
        : null,
    text: text.trim() || null,
    fontFamily: fontFamily === "" ? null : fontFamily,
    fontWeight: mark?.fontWeight ?? null,
    letterSpacing: mark?.letterSpacing ?? null,
  };
  const critique = useMutation(
    orpc.brand.critiqueMark.mutationOptions({
      onSuccess: (result) => setTuning(result),
      onError: (error) => toast.error(error.message),
    }),
  );

  // The editor opens on the saved lockup, so an edit starts from what the
  // cards show and not from defaults.
  const openEditor = () => {
    if (building) return setBuilding(false);
    if (mark?.source === "lockup") {
      setIcon(mark.iconFrom ?? (mark.iconAssetId ? "library" : "none"));
      setIconAssetId(mark.iconAssetId ?? "");
      setText(mark.text ?? brandName);
      setFont(
        mark.fontFamily == null
          ? "house"
          : mark.fontFamily === bodyFont
            ? "body"
            : "heading",
      );
    }
    setTone("color");
    setTuning(null);
    setBuilding(true);
  };

  const onDone = (message: string) => () => {
    toast.success(message);
    setBuilding(false);
    router.refresh();
  };
  const setMark = useMutation(
    orpc.brand.setMark.mutationOptions({
      onSuccess: onDone("Brand mark updated"),
      onError: (error) => toast.error(error.message),
    }),
  );
  const setLogoDefault = useMutation(
    orpc.brand.setPerformanceSettings.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => toast.error(error.message),
    }),
  );
  const clearMark = useMutation(
    orpc.brand.clearMark.mutationOptions({
      onSuccess: onDone("Brand mark cleared"),
      onError: (error) => toast.error(error.message),
    }),
  );
  const suggest = useMutation(
    orpc.brand.suggestMark.mutationOptions({
      onSuccess: () => {
        setBuilding(false);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const busy = setMark.isPending || clearMark.isPending || suggest.isPending;

  return (
    <section
      id="brand-mark"
      className="scroll-mt-6 space-y-4 rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Brand mark</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {mark ? describe(mark, brandName) : "No mark yet"}
          </p>
          {mark?.reason ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {mark.reason}
            </p>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={logoOnCreatives}
            disabled={setLogoDefault.isPending}
            onChange={(event) =>
              setLogoDefault.mutate({
                brandId,
                patch: { logoOnCreatives: event.target.checked },
              })
            }
          />
          Mark on new ad and catalog cards
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={mark ? "outline" : "default"}
            disabled={busy}
            loading={suggest.isPending}
            onClick={() => suggest.mutate({ brandId })}
          >
            <Sparkles className="size-3.5" />
            {suggest.isPending
              ? "Trying marks…"
              : mark
                ? "Suggest again"
                : "Suggest a mark"}
          </Button>
          <Button
            size="sm"
            variant={building ? "default" : "outline"}
            disabled={busy}
            onClick={openEditor}
          >
            Edit
          </Button>
        </div>
      </div>

      {variants ? (
        <div className="grid grid-cols-3 gap-2">
          <Swatch
            label="Colour on white"
            src={variants.color}
            className="bg-white"
          />
          <Swatch
            label="White on dark"
            src={variants.white}
            className="bg-neutral-900"
          />
          <Swatch
            label="White on photo"
            src={variants.white}
            className="bg-neutral-800"
            photo={photo}
          />
        </div>
      ) : null}

      {building ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Use as is:</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || !logo}
              onClick={() => setMark.mutate({ brandId, source: "logo" })}
            >
              Site logo
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setMark.mutate({ brandId, source: "favicon" })}
            >
              Favicon
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 @xl:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <SimpleSelect
                value={icon}
                onValueChange={editRecipe((value: string) =>
                  setIcon(value as IconChoice),
                )}
                options={[
                  ...(logo
                    ? [
                        { value: "logo", label: "Site logo" },
                        { value: "logo-icon", label: "Icon cut from the logo" },
                      ]
                    : []),
                  { value: "favicon", label: "Favicon" },
                  { value: "library", label: "Library image" },
                  { value: "none", label: "No icon" },
                ]}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={text}
                maxLength={60}
                onChange={editRecipe(
                  (event: React.ChangeEvent<HTMLInputElement>) =>
                    setText(event.target.value),
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Font</Label>
              <SimpleSelect
                value={font}
                onValueChange={editRecipe((value: string) =>
                  setFont(value as FontChoice),
                )}
                options={[
                  {
                    value: "heading",
                    label: headingFont
                      ? `${headingFont} (heading)`
                      : "Heading (none read)",
                  },
                  {
                    value: "body",
                    label: bodyFont ? `${bodyFont} (body)` : "Body (none read)",
                  },
                  { value: "house", label: "House font" },
                ]}
                className="w-full"
              />
            </div>
          </div>

          {icon === "library" ? (
            <div className="grid grid-cols-8 gap-1.5">
              {(library.data ?? [])
                .filter((asset) => asset.url)
                .slice(0, 24)
                .map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={editRecipe(() => setIconAssetId(asset.id))}
                    className={cn(
                      "aspect-square overflow-hidden rounded-md border bg-white",
                      iconAssetId === asset.id && "ring-2 ring-primary",
                    )}
                    title={asset.title ?? undefined}
                  >
                    {/* oxlint-disable-next-line nextjs/no-img-element */}
                    <img
                      src={asset.thumbnailUrl ?? asset.url!}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  </button>
                ))}
              {library.isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center gap-2 text-xs">
            {(["color", "white", "dark"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                className={cn(
                  "rounded-md border px-2 py-0.5 capitalize",
                  tone === t && "bg-muted font-medium",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div
            className={cn(
              "flex h-24 items-center justify-center overflow-hidden rounded-lg border",
              tone === "white" ? "bg-neutral-900" : "bg-white",
            )}
          >
            {previewUrl ? (
              // oxlint-disable-next-line nextjs/no-img-element
              <img
                key={previewUrl}
                src={previewUrl}
                alt=""
                className="max-h-10 max-w-[90%] object-contain"
              />
            ) : (
              <span className="text-xs text-muted-foreground">
                Pick an image to preview.
              </span>
            )}
          </div>

          {tuning ? (
            <p className="rounded-lg border border-dashed p-3 text-[11px] leading-4 text-muted-foreground">
              <span className="font-medium">Art director:</span> {tuning.note}{" "}
              <span className="font-mono">
                (icon ×{tuning.iconScale}, shift {tuning.iconShift}, gap ×
                {tuning.gapScale})
              </span>
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={
                busy ||
                critique.isPending ||
                (icon === "library" && !iconAssetId)
              }
              onClick={() => critique.mutate({ id: brandId, ...recipe })}
              title="Have Claude judge this lockup and apply its corrections to the preview"
            >
              <Wand2
                className={cn(
                  "mr-1.5 size-3.5",
                  critique.isPending && "animate-pulse",
                )}
              />
              {critique.isPending
                ? "Judging…"
                : tuning
                  ? "Fix again"
                  : "Fix with AI"}
            </Button>
            <div className="flex gap-2">
              {mark ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => clearMark.mutate({ id: brandId })}
                >
                  Clear mark
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setBuilding(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={busy || (icon === "library" && !iconAssetId)}
                onClick={() =>
                  setMark.mutate({
                    brandId,
                    source: "lockup",
                    ...recipe,
                    tuning,
                  })
                }
              >
                {setMark.isPending ? "Rendering…" : "Save mark"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function describe(mark: BrandMark, brandName: string) {
  if (mark.source === "logo") return "The site logo";
  if (mark.source === "favicon") return "The favicon";
  const name = `“${mark.text ?? brandName}”${mark.fontFamily ? ` in ${mark.fontFamily}` : ""}`;
  if (mark.iconFrom === "logo-icon") return `Logo icon and ${name}`;
  if (mark.iconFrom || mark.iconAssetId) return `Icon and ${name}`;
  return `Name only, ${name}`;
}

function Swatch({
  label,
  src,
  className,
  photo,
}: {
  label: string;
  src: string;
  className?: string;
  photo?: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="border-b px-2 py-1 text-[11px] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "flex h-16 items-center justify-center bg-cover bg-center p-3",
          className,
        )}
        style={photo ? { backgroundImage: `url(${photo})` } : undefined}
      >
        {/* The size a mark is drawn at on a card, so it is judged at that size. */}
        {/* oxlint-disable-next-line nextjs/no-img-element */}
        <img src={src} alt="" className="max-h-9 max-w-full object-contain" />
      </div>
    </div>
  );
}
