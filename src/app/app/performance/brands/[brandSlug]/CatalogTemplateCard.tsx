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
import {
  CATALOG_COPY_INTENTS,
  COMPOSITION_TEMPLATES,
} from "@/lib/compositions";
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
  // A catalog of supplied artwork still has homes and photos: draw the hero
  // home's own photo in each template, so the choice can be made before any
  // card is switched to Compose.
  const pick =
    drawn.find((c) => c.homeId === heroHomeId) ??
    drawn.find((c) => c.included) ??
    cards.find((c) => c.homeId === heroHomeId) ??
    cards.find((c) => c.included);
  const card = pick && { ...pick, mode: "compose" as const };
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
      <ul className="divide-y">
        {CATALOG_TEMPLATES.map((templateId) => {
          const label =
            COMPOSITION_TEMPLATES.find((t) => t.id === templateId)?.label ??
            templateId;
          const guide = CATALOG_COPY_INTENTS[templateId];
          const src = catalogCardPreviewUrl(
            brandId,
            asTemplate(card, templateId),
            format,
          );
          const chosen = current === templateId;
          return (
            <li key={templateId}>
              <button
                type="button"
                aria-pressed={chosen}
                disabled={saving !== null}
                onClick={() => save.mutate({ brandId, templateId })}
                className={cn(
                  "flex w-full items-start gap-4 rounded-lg p-2 text-left text-sm hover:bg-muted/50",
                  chosen && "bg-muted",
                )}
              >
                {src && (
                  // oxlint-disable-next-line nextjs/no-img-element
                  <img
                    src={src}
                    alt={label}
                    className={cn(
                      "w-24 shrink-0 rounded-md object-cover",
                      format === "square" ? "aspect-square" : "aspect-[4/5]",
                    )}
                  />
                )}
                <span className="min-w-0 space-y-1">
                  <span className="block font-medium">
                    {label}
                    {chosen
                      ? " · default"
                      : saving === templateId
                        ? " · saving…"
                        : ""}
                  </span>
                  {guide && (
                    <>
                      <span className="block text-xs text-muted-foreground">
                        Headline ≤{guide.headlineChars} characters
                        {guide.placeSuffix
                          ? " · ends “in {place}”"
                          : " · no place in the headline"}
                        {guide.pills ? ` · ${guide.pills} amenity pills` : ""}
                      </span>
                      <span className="block text-muted-foreground">
                        {guide.intent}
                      </span>
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The same card on another template. The place card reads "{lead} in
 * {place}", so a headline written without a place gets the card's; the
 * others have no place line, so they show the lead alone.
 */
function asTemplate(card: CatalogCard, templateId: CatalogTemplateId) {
  const at = card.title.lastIndexOf(" in ");
  const title =
    templateId === "catalog-place"
      ? at > 0 || !card.location
        ? card.title
        : `${card.title} in ${card.location}`
      : at > 0
        ? card.title.slice(0, at)
        : card.title;
  return { ...card, templateId, title };
}
