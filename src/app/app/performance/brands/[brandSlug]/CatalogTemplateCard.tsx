"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import {
  CATALOG_TEMPLATES,
  catalogCardPreviewUrl,
  type CatalogCard,
  type CatalogDraft,
  type CatalogTemplateId,
} from "@/lib/catalog-studio";
import { COMPOSITION_TEMPLATES } from "@/lib/compositions";

/**
 * The catalog card every home uses unless it has its own: the hero home's
 * card drawn in each template, one click to make it the brand's default.
 */
export function CatalogTemplateCard({
  brandId,
  heroHomeId,
  onChosen,
}: {
  brandId: string;
  /** The hero home's listing id; the first included card without one. */
  heroHomeId: string | null;
  onChosen?: (templateId: CatalogTemplateId) => void;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const url = `/api/performance/catalog/${brandId}/studio`;
  const query = useQuery<{
    draft: CatalogDraft;
    defaultTemplate: CatalogTemplateId;
  }>({
    queryKey: ["catalog-studio", brandId],
    queryFn: async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Unable to load the catalog");
      return (await response.json()) as {
        draft: CatalogDraft;
        defaultTemplate: CatalogTemplateId;
      };
    },
  });
  const [saving, setSaving] = useState<CatalogTemplateId | null>(null);
  const cards = query.data?.draft.cards ?? [];
  const drawn = cards.filter((c) => c.mode !== "finished");
  const card =
    drawn.find((c) => c.homeId === heroHomeId) ?? drawn.find((c) => c.included);
  const current = query.data?.defaultTemplate ?? "catalog-place";

  async function choose(templateId: CatalogTemplateId) {
    setSaving(templateId);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "defaultTemplate", templateId }),
    });
    setSaving(null);
    if (!response.ok) return toast.error("Unable to save the catalog card");
    await client.invalidateQueries({ queryKey: ["catalog-studio", brandId] });
    router.refresh();
    onChosen?.(templateId);
  }

  if (!card) return null;
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        {CATALOG_TEMPLATES.map((templateId) => {
          const label =
            COMPOSITION_TEMPLATES.find((t) => t.id === templateId)?.label ??
            templateId;
          const src = catalogCardPreviewUrl(
            brandId,
            asTemplate(card, templateId),
          );
          return (
            <button
              key={templateId}
              aria-pressed={current === templateId}
              disabled={saving !== null}
              onClick={() => void choose(templateId)}
              className={cn(
                "space-y-2 rounded-lg border p-2 text-left text-sm",
                current === templateId && "ring-2 ring-foreground",
              )}
            >
              {src && (
                // oxlint-disable-next-line nextjs/no-img-element
                <img
                  src={src}
                  alt={label}
                  className="aspect-[4/5] w-full rounded-md object-cover"
                />
              )}
              <span className="block">
                {label}
                {current === templateId
                  ? " · default"
                  : saving === templateId
                    ? " · saving…"
                    : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The same card on another template. The place card splits "{lead} in
 * {place}"; the others have no place line, so they show the lead alone.
 */
function asTemplate(card: CatalogCard, templateId: CatalogTemplateId) {
  const at = card.title.lastIndexOf(" in ");
  const title =
    templateId !== "catalog-place" && at > 0
      ? card.title.slice(0, at)
      : card.title;
  return { ...card, templateId, title };
}
