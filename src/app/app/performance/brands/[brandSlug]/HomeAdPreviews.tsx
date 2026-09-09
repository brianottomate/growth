"use client";

import { useState } from "react";
import { PenLine } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/components/ui/lib/utils";
import { adPreviewStudioHref } from "@/lib/ad-preview-links";
import { getCompositionFormat } from "@/lib/compositions";
import {
  HOME_PREVIEW_FORMATS,
  homePreviewRecipes,
  homePreviewUrl,
  type HomeForPreview,
} from "@/lib/home-ad-previews";

/**
 * One home, every size: three lines of copy across four canvases, each tile
 * rendered on demand by the Studio's preview route. Nothing is saved; a tile
 * opens in the Studio with its copy, and freezing there is what keeps it.
 */
export function HomeAdPreviews({
  open,
  onOpenChange,
  brandId,
  brandSlug,
  sourceAssetId,
  home,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  brandSlug: string | null;
  sourceAssetId: string | null;
  home: HomeForPreview | null;
}) {
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const recipes = home ? homePreviewRecipes(home) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {home && sourceAssetId ? (
        <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-6xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-5 py-3 pr-12 text-left">
            <DialogTitle className="text-sm">{home.name}</DialogTitle>
            <DialogDescription className="text-xs">
              Three lines of copy across four canvases, drawn as they would run. Open one to edit or keep it.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
            {recipes.map((recipe) => (
              <section key={recipe.id} className="space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <p className="text-muted-foreground text-[10.5px] font-semibold tracking-[0.09em] uppercase">
                    {recipe.label}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">{recipe.title}</p>
                </div>
                <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {HOME_PREVIEW_FORMATS.map((formatId) => {
                    const format = getCompositionFormat(formatId);
                    const key = `${recipe.id}:${formatId}`;
                    const src = homePreviewUrl({ brandId, sourceMediaAssetId: sourceAssetId, formatId, recipe });
                    return (
                      <li key={key} className="group flex flex-col gap-1.5">
                        <div
                          className="bg-muted relative overflow-hidden rounded-xl border"
                          style={{ aspectRatio: `${format.width} / ${format.height}` }}
                        >
                          {failed[key] ? (
                            <p className="text-muted-foreground absolute inset-0 grid place-items-center px-3 text-center text-[11px]">
                              Could not render
                            </p>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={src}
                              alt={`${recipe.label}, ${format.label}`}
                              loading="lazy"
                              onError={() => setFailed((prev) => ({ ...prev, [key]: true }))}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground text-[11px]">
                            {format.label} · {format.width}×{format.height}
                          </span>
                          <ButtonLink
                            href={adPreviewStudioHref({
                              brandId,
                              brandSlug,
                              sourceAssetId,
                              templateId: "hero-overlay",
                              formatId,
                              title: recipe.title,
                              cta: recipe.cta,
                            })}
                            size="sm"
                            variant="ghost"
                            className={cn("h-6 px-2 text-[11px] opacity-0 transition group-hover:opacity-100")}
                          >
                            <PenLine className="size-3" />
                            Studio
                          </ButtonLink>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
