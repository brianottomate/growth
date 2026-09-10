"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { AdMock, type AdMockSurface } from "@/components/ad-mock";
import { toast } from "@/components/ui/toast";
import { adPreviewStudioHref } from "@/lib/ad-preview-links";
import { getCompositionFormat, getCompositionTemplate } from "@/lib/compositions";
import { compositionPreviewUrl, type PreviewSpec } from "@/lib/home-ad-previews";
import { useTRPC } from "@/trpc/react";

type Direction = {
  verdict: "keep" | "adjust";
  note: string;
  changes: string[];
  title: string;
  subtitle: string | null;
  focal: { x: number; y: number } | null;
  scrim: string | null;
  sourceMediaAssetId: string | null;
};

/**
 * One on-demand card in a placement mock, with the art director a click away.
 *
 * Direct imports the home's hero once (the director judges against a library
 * photo), runs the director on this exact spec, and redraws the tile with its
 * focal point, scrim, copy and, when it extended the photo, the new source.
 * Keep freezes that card into the brand's previews; Undo returns to the first
 * pass. Nothing is saved before Keep except the imported photo.
 */
export function OnDemandTile({
  brandId,
  brandSlug,
  brandName,
  brandLogo,
  surface,
  spec,
  home,
}: {
  brandId: string;
  brandSlug: string;
  brandName: string;
  brandLogo: string | null;
  surface: AdMockSurface;
  spec: PreviewSpec;
  home: { name: string; url: string; imageUrl: string };
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [assetId, setAssetId] = useState<string | null>(
    "assetId" in spec.source ? spec.source.assetId : null,
  );
  const [direction, setDirection] = useState<Direction | null>(null);
  const [phase, setPhase] = useState<"idle" | "importing" | "directing" | "keeping">("idle");

  const directed: PreviewSpec | null =
    direction && assetId
      ? {
          ...spec,
          source: { assetId: direction.sourceMediaAssetId ?? assetId },
          title: direction.title || spec.title,
          subtitle: direction.subtitle ?? spec.subtitle,
          focal: direction.focal,
          scrim: direction.scrim,
        }
      : null;
  const shown = directed ?? spec;
  const format = getCompositionFormat(spec.formatId);
  const template = getCompositionTemplate(spec.templateId);

  const importHero = useMutation(trpc.media.importUrls.mutationOptions());
  const direct = useMutation(trpc.composition.direct.mutationOptions());
  const freeze = useMutation(trpc.composition.freeze.mutationOptions());
  const addPreview = useMutation(trpc.brand.addAdPreview.mutationOptions());

  const ensureAsset = async () => {
    if (assetId) return assetId;
    setPhase("importing");
    const result = await importHero.mutateAsync({
      brandId,
      images: [{ url: home.imageUrl, title: home.name }],
    });
    const asset = result.assets[0];
    if (!asset) throw new Error("The photo could not be brought into the library");
    setAssetId(asset.id);
    return asset.id;
  };

  const fullSpec = (sourceAssetId: string, base: PreviewSpec) => ({
    brandId,
    templateId: base.templateId,
    formatId: base.formatId,
    sourceMediaAssetId: sourceAssetId,
    title: base.title,
    subtitle: base.subtitle ?? undefined,
    eyebrow: base.eyebrow ?? undefined,
    cta: base.cta ?? undefined,
    rating: base.rating ?? undefined,
    focal: base.focal ?? undefined,
    scrim: base.scrim ?? undefined,
    imagePosition: "center" as const,
    mark: "none" as const,
  });

  const runDirector = async () => {
    try {
      const id = await ensureAsset();
      setPhase("directing");
      const result = await direct.mutateAsync(fullSpec(id, spec));
      setDirection(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The art director could not be reached");
    } finally {
      setPhase("idle");
    }
  };

  const keep = async () => {
    try {
      const id = await ensureAsset();
      setPhase("keeping");
      const base = directed ?? spec;
      const sourceAssetId = "assetId" in base.source ? base.source.assetId : id;
      const asset = await freeze.mutateAsync({
        ...fullSpec(sourceAssetId, base),
        assetTitle: `${home.name} · ${template.label} · ${format.label}`,
      });
      await addPreview.mutateAsync({ id: brandId, assetId: asset.id, homeUrl: home.url });
      toast.success("Kept. It is in the previews and the library.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not keep the card");
    } finally {
      setPhase("idle");
    }
  };

  // The Studio works from the library copy too, so it opens after the import.
  const openStudio = async () => {
    try {
      const id = await ensureAsset();
      const base = directed ?? spec;
      router.push(
        adPreviewStudioHref({
          brandId,
          brandSlug,
          sourceAssetId: "assetId" in base.source ? base.source.assetId : id,
          templateId: spec.templateId,
          formatId: spec.formatId,
          title: base.title,
          cta: base.cta ?? undefined,
          eyebrow: base.eyebrow ?? undefined,
          subtitle: base.subtitle ?? undefined,
          rating: base.rating ?? null,
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the Studio");
    } finally {
      setPhase("idle");
    }
  };

  const busy = phase !== "idle";
  const busyLabel =
    phase === "importing"
      ? "Bringing the photo in…"
      : phase === "directing"
        ? "Art director looking…"
        : phase === "keeping"
          ? "Keeping…"
          : null;

  return (
    <li className="flex flex-col items-center gap-2">
      <AdMock
        surface={surface}
        brandName={brandName}
        brandLogo={brandLogo}
        body={null}
        headline={home.name}
        link={home.url}
        callToAction="Book now"
        media={[{ url: compositionPreviewUrl(shown), thumbnail: null, type: "image" }]}
        className={surface === "story" ? "w-full max-w-60" : "w-full max-w-80"}
      />
      <div className="text-muted-foreground flex w-full max-w-80 flex-col gap-1 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">
            {busyLabel ?? (direction ? `directed · ${direction.verdict}` : "drawn now")}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {direction ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setDirection(null)}
                className="hover:text-foreground disabled:opacity-50"
              >
                Undo
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runDirector()}
                className="inline-flex items-center gap-1 text-sky-300 hover:underline disabled:opacity-50"
                title="Ask the art director to judge and adjust this card"
              >
                <Sparkles className="size-3" />
                Direct
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void keep()}
              className="text-sky-300 hover:underline disabled:opacity-50"
              title="Freeze this card into the previews"
            >
              Keep
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void openStudio()}
              className="text-sky-300 hover:underline disabled:opacity-50"
              title="Open this card in the Studio"
            >
              Studio
            </button>
          </span>
        </div>
        {direction ? (
          <p className="text-[11px] leading-snug">
            {direction.note}
            {direction.changes.length > 0 ? ` ${direction.changes.join("; ")}.` : ""}
          </p>
        ) : null}
      </div>
    </li>
  );
}
