"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import {
  CATALOG_TEMPLATES,
  catalogCardPreviewUrl,
  type CatalogCard,
  type CatalogTemplateId,
  CATALOG_FORMATS,
} from "@/lib/catalog-studio";
import { COMPOSITION_TEMPLATES } from "@/lib/compositions";
import { orpc } from "@/orpc/client";

/**
 * The catalog card every home uses unless it has its own: the hero home's
 * card drawn in each template, one click to make it the brand's default.
 */
export function CatalogTemplateCard({
  brandId,
  heroHomeId,
}: {
  brandId: string;
  /** The hero home's listing id; the first included card without one. */
  heroHomeId: string | null;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const state = orpc.catalog.state.queryOptions({ input: { brandId } });
  const query = useQuery(state);
  const save = useMutation(
    orpc.catalog.setDefaultTemplate.mutationOptions({
      onError: () => toast.error("Unable to save the catalog card"),
      onSuccess: async () => {
        await client.invalidateQueries({ queryKey: state.queryKey });
        router.refresh();
      },
    }),
  );
  const saving = save.isPending ? (save.variables?.templateId ?? null) : null;
  const setFormat = useMutation(
    orpc.catalog.setFormat.mutationOptions({
      onError: () => toast.error("Unable to change the catalog size"),
      onSuccess: async () => {
        await client.invalidateQueries({ queryKey: state.queryKey });
        router.refresh();
      },
    }),
  );
  const format = query.data?.format ?? "portrait";
  const cards = query.data?.draft.cards ?? [];
  const drawn = cards.filter((c) => c.mode !== "finished");
  const card =
    drawn.find((c) => c.homeId === heroHomeId) ?? drawn.find((c) => c.included);
  const current = query.data?.defaultTemplate ?? "catalog-place";

  if (!card) return null;
  return (
    <div className="space-y-3">
      <div className="flex w-fit rounded-lg border p-0.5 text-sm">
        {CATALOG_FORMATS.map((id) => (
          <Button
            key={id}
            size="sm"
            variant={format === id ? "secondary" : "ghost"}
            aria-pressed={format === id}
            disabled={setFormat.isPending}
            onClick={() => setFormat.mutate({ brandId, formatId: id })}
          >
            {id === "square" ? "Square 1:1" : "Portrait 4:5"}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        {CATALOG_TEMPLATES.map((templateId) => {
          const label =
            COMPOSITION_TEMPLATES.find((t) => t.id === templateId)?.label ??
            templateId;
          const src = catalogCardPreviewUrl(
            brandId,
            asTemplate(card, templateId),
            format,
          );
          return (
            <button
              key={templateId}
              aria-pressed={current === templateId}
              disabled={saving !== null}
              onClick={() => save.mutate({ brandId, templateId })}
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
                  className={cn(
                    "w-full rounded-md object-cover",
                    format === "square" ? "aspect-square" : "aspect-[4/5]",
                  )}
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
