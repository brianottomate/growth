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
import { useTRPC } from "@/trpc/react";

type Variants = { color: string; white: string; dark: string };
type Tuning = NonNullable<BrandMark["tuning"]>;
type IconChoice = "logo" | "favicon" | "none" | "library";
type FontChoice = "heading" | "body" | "house";

/**
 * The mark a brand's cards carry. Shows the current one three ways, and lets
 * the operator point at the site logo or favicon, or build a lockup of an icon
 * beside the name in the brand font. Every choice renders colour, white and
 * dark variants, which is how a brand-coloured mark stays legible on a photo.
 */
export function BrandMarkCard({
  brandId,
  brandName,
  logo,
  identity,
  mark,
  variants,
  photo,
}: {
  brandId: string;
  brandName: string;
  logo: string | null;
  identity: BrandIdentity | null;
  mark: BrandMark | null;
  variants: Variants | null;
  /** A photo to preview the white mark over: the OG image or a hero. */
  photo: string | null;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [building, setBuilding] = useState(false);
  const [icon, setIcon] = useState<IconChoice>(logo ? "logo" : "none");
  const [iconAssetId, setIconAssetId] = useState<string>("");
  const [text, setText] = useState(brandName);
  const [font, setFont] = useState<FontChoice>("heading");
  const [tone, setTone] = useState<"color" | "white" | "dark">("color");
  // What "Fix with AI" returned for the lockup as currently edited. Any edit
  // to the recipe drops it: the correction belonged to the previous picture.
  const [tuning, setTuning] = useState<Tuning | null>(null);
  const editRecipe = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setTuning(null);
  };

  const fonts = identity?.fonts ?? [];
  const headingFont = fonts.find((f) => f.role === "heading")?.family ?? fonts[0]?.family ?? null;
  const bodyFont = fonts.find((f) => f.role === "body")?.family ?? null;
  const fontFamily = font === "heading" ? headingFont : font === "body" ? bodyFont : "";

  const library = useQuery({
    ...trpc.media.list.queryOptions({ brandId, kind: "image" }),
    enabled: building && icon === "library",
  });

  const previewUrl = useMemo(() => {
    if (!building) return null;
    if (icon === "library" && !iconAssetId) return null;
    const params = new URLSearchParams({ brandId, source: "lockup", tone });
    if (icon === "library") params.set("iconAssetId", iconAssetId);
    if (text.trim()) params.set("text", text.trim());
    if (fontFamily !== null) params.set("fontFamily", fontFamily);
    // A lockup with the site logo or favicon as its icon reuses those sources.
    if (icon === "logo" || icon === "favicon") params.set("iconFrom", icon);
    if (tuning) {
      params.set("iconScale", String(tuning.iconScale));
      params.set("iconShift", String(tuning.iconShift));
      params.set("gapScale", String(tuning.gapScale));
    }
    return `/api/brands/mark-preview?${params.toString()}`;
  }, [brandId, building, fontFamily, icon, iconAssetId, text, tone, tuning]);

  const recipe = {
    iconAssetId: icon === "library" ? iconAssetId : null,
    iconFrom: icon === "logo" || icon === "favicon" ? icon : undefined,
    text: text.trim() || null,
    fontFamily: fontFamily === "" ? null : fontFamily,
  };
  const critique = useMutation(
    trpc.brand.critiqueMark.mutationOptions({
      onSuccess: (result) => setTuning(result),
      onError: (error) => toast.error(error.message),
    }),
  );

  // A saved lockup, back in the editor as it was saved, judged straight away.
  // The critique runs on the saved recipe itself, so what it corrects is the
  // mark on the cards and not a re-typed approximation of it.
  const fixSavedLockup = () => {
    if (mark?.source !== "lockup") return;
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
    setTone("color");
    setTuning(null);
    setBuilding(true);
    critique.mutate({
      id: brandId,
      iconAssetId: mark.iconAssetId ?? null,
      iconFrom: mark.iconFrom ?? undefined,
      text: mark.text ?? null,
      fontFamily: mark.fontFamily ?? null,
    });
  };

  const onDone = (message: string) => () => {
    toast.success(message);
    setBuilding(false);
    router.refresh();
  };
  const setMark = useMutation(
    trpc.brand.setMark.mutationOptions({
      onSuccess: onDone("Brand mark updated"),
      onError: (error) => toast.error(error.message),
    }),
  );
  const clearMark = useMutation(
    trpc.brand.clearMark.mutationOptions({
      onSuccess: onDone("Brand mark cleared"),
      onError: (error) => toast.error(error.message),
    }),
  );
  const busy = setMark.isPending || clearMark.isPending;

  return (
    <section className="space-y-4 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Brand mark</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {mark
              ? `${describe(mark)}. Cards draw the white version over photos and the colour version on light grounds.`
              : "No mark chosen. Cards fall back to the scraped logo, cut white over photos."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={busy || !logo} onClick={() => setMark.mutate({ id: brandId, source: "logo" })}>
            Use logo
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setMark.mutate({ id: brandId, source: "favicon" })}>
            Use favicon
          </Button>
          <Button size="sm" variant={building ? "default" : "outline"} disabled={busy} onClick={() => setBuilding((b) => !b)}>
            Build lockup
          </Button>
          <Button size="sm" variant="ghost" disabled title="Generated marks are coming later">
            <Sparkles className="mr-1.5 size-3.5" /> Generate
          </Button>
        </div>
      </div>

      <Critique mark={mark} />

      {variants ? (
        <div className="grid grid-cols-3 gap-2">
          <Swatch label="Colour on white" src={variants.color} className="bg-white" />
          <Swatch label="White on dark" src={variants.white} className="bg-neutral-900" />
          <Swatch label="White on photo" src={variants.white} className="bg-neutral-800" photo={photo} />
        </div>
      ) : null}

      {building ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <SimpleSelect
                value={icon}
                onValueChange={editRecipe((value: string) => setIcon(value as IconChoice))}
                options={[
                  ...(logo ? [{ value: "logo", label: "Site logo" }] : []),
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
                onChange={editRecipe((event: React.ChangeEvent<HTMLInputElement>) => setText(event.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Font</Label>
              <SimpleSelect
                value={font}
                onValueChange={editRecipe((value: string) => setFont(value as FontChoice))}
                options={[
                  { value: "heading", label: headingFont ? `${headingFont} (heading)` : "Heading (none read)" },
                  { value: "body", label: bodyFont ? `${bodyFont} (body)` : "Body (none read)" },
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
                      iconAssetId === asset.id && "ring-primary ring-2",
                    )}
                    title={asset.title ?? undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.thumbnailUrl ?? asset.url!} alt="" className="h-full w-full object-contain" />
                  </button>
                ))}
              {library.isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
            </div>
          ) : null}

          <div className="flex items-center gap-2 text-xs">
            {(["color", "white", "dark"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                className={cn("rounded-md border px-2 py-0.5 capitalize", tone === t && "bg-muted font-medium")}
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
              // eslint-disable-next-line @next/next/no-img-element
              <img key={previewUrl} src={previewUrl} alt="" className="max-h-10 max-w-[90%] object-contain" />
            ) : (
              <span className="text-muted-foreground text-xs">Pick an image to preview.</span>
            )}
          </div>

          {tuning ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-[11px] leading-4">
              <span className="font-medium">Art director:</span> {tuning.note}{" "}
              <span className="font-mono">
                (icon ×{tuning.iconScale}, shift {tuning.iconShift}, gap ×{tuning.gapScale})
              </span>
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || critique.isPending || (icon === "library" && !iconAssetId)}
              onClick={() => critique.mutate({ id: brandId, ...recipe })}
              title="Have Claude judge this lockup and apply its corrections to the preview"
            >
              <Wand2 className={cn("mr-1.5 size-3.5", critique.isPending && "animate-pulse")} />
              {critique.isPending ? "Judging…" : tuning ? "Fix again" : "Fix with AI"}
            </Button>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setBuilding(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={busy || (icon === "library" && !iconAssetId)}
                onClick={() => setMark.mutate({ id: brandId, source: "lockup", ...recipe, tuning })}
              >
                {setMark.isPending ? "Rendering…" : "Save mark"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {mark ? (
        <div className="flex justify-end gap-2">
          {mark.source === "lockup" && !building ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy || critique.isPending}
              onClick={fixSavedLockup}
              title="Reopen the saved lockup, have Claude judge it, and apply its corrections to the preview"
            >
              <Wand2 className={cn("mr-1.5 size-3.5", critique.isPending && "animate-pulse")} />
              {critique.isPending ? "Judging…" : "Fix with AI"}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => clearMark.mutate({ id: brandId })}>
            Clear mark
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function describe(mark: BrandMark) {
  if (mark.source === "logo") return "Using the site logo";
  if (mark.source === "favicon") return "Using the favicon";
  return `Lockup: “${mark.text ?? ""}”${mark.fontFamily ? ` in ${mark.fontFamily}` : ""}`;
}

/** What the art-director pass said when the lockup was saved. */
function Critique({ mark }: { mark: BrandMark | null }) {
  const note = mark?.tuning?.note;
  if (!note) return null;
  return (
    <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-[11px] leading-4">
      <span className="font-medium">Art director:</span> {note}
    </p>
  );
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
      <div className="text-muted-foreground border-b px-2 py-1 text-[11px]">{label}</div>
      <div
        className={cn("flex h-16 items-center justify-center bg-cover bg-center p-3", className)}
        style={photo ? { backgroundImage: `url(${photo})` } : undefined}
      >
        {/* The size a mark is drawn at on a card, so it is judged at that size. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="max-h-9 max-w-full object-contain" />
      </div>
    </div>
  );
}
