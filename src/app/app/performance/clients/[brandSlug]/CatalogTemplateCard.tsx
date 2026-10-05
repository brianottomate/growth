"use client";

import { useWorkspaceMutation } from "./useWorkspaceMutation";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Combobox } from "@/components/ui/compound/combobox";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import {
  CATALOG_TEMPLATES,
  catalogCardPreviewUrl,
  type CatalogCard,
  type CatalogTemplateId,
  DEFAULT_CATALOG_FORMAT,
  DEFAULT_CATALOG_TEMPLATE,
  isPlaceCard,
} from "@/lib/catalog-studio";
import {
  CATALOG_COPY_INTENTS,
  COMPOSITION_TEMPLATES,
  previewAtWidth,
} from "@/lib/compositions";
import { orpc } from "@/orpc/client";

/**
 * An included home provides the template preview, forced to
 * Compose so a catalog of supplied artwork can still pick a template.
 */
function useTemplatePreview(brandId: string, previewHomeId: string | null) {
  const query = useQuery(
    orpc.catalog.state.queryOptions({ input: { brandId } }),
  );
  const format = query.data?.format ?? DEFAULT_CATALOG_FORMAT;
  const cards = (query.data?.draft.cards ?? []).filter((c) => c.included);
  const drawn = cards.filter((c) => c.mode !== "finished");
  const pick =
    cards.find((c) => c.homeId === previewHomeId) ?? drawn[0] ?? cards[0];
  const card = pick && { ...pick, mode: "compose" as const };
  const current = query.data?.defaultTemplate ?? DEFAULT_CATALOG_TEMPLATE;
  return {
    card,
    format,
    current,
    cards,
    homes: query.data?.homes ?? [],
    pending: query.isPending,
    error: query.error,
    refetch: query.refetch,
  };
}

const templateLabel = (templateId: CatalogTemplateId) =>
  COMPOSITION_TEMPLATES.find((t) => t.id === templateId)?.label ?? templateId;

/** The brand's default card, closed: its thumbnail and the copy it asks for. */
export function CatalogTemplateSummary({
  brandId,
  previewHomeId = null,
}: {
  brandId: string;
  previewHomeId?: string | null;
}) {
  const { card, format, current } = useTemplatePreview(brandId, previewHomeId);
  const guide = CATALOG_COPY_INTENTS[current];
  const src = card
    ? previewAtWidth(
        catalogCardPreviewUrl(brandId, asTemplate(card, current), format),
        48,
      )
    : null;
  return (
    <span className="flex min-w-0 items-center gap-3">
      {src ? (
        // oxlint-disable-next-line nextjs/no-img-element
        <img
          src={src}
          alt=""
          className="aspect-square w-12 shrink-0 rounded object-cover"
        />
      ) : null}
      <span className="min-w-0 space-y-0.5">
        <span className="block font-medium">
          Catalog card · {templateLabel(current).replace(/^Catalog · /, "")}
        </span>
        {guide ? (
          <>
            <span className="block text-xs text-muted-foreground">
              <GuideLimits guide={guide} />
            </span>
            <span className="line-clamp-1 text-xs text-muted-foreground">
              {guide.intent}
            </span>
          </>
        ) : null}
      </span>
    </span>
  );
}

/**
 * The catalog card every home uses unless it has its own: an included home's
 * card drawn in each template, one click to make it the brand's default.
 */
export function CatalogTemplateCard({
  brandId,
  previewHomeId = null,
}: {
  brandId: string;
  /** Optional initial sample home; defaults to an included card. */
  previewHomeId?: string | null;
}) {
  const client = useQueryClient();
  const state = orpc.catalog.state.queryOptions({ input: { brandId } });
  const save = useWorkspaceMutation(
    orpc.catalog.setDefaultTemplate.mutationOptions({
      onError: () => toast.error("Unable to save the catalog card"),
      onSuccess: async () => {
        await client.invalidateQueries({ queryKey: state.queryKey });
      },
    }),
  );
  const [selectedHomeId, setSelectedHomeId] = useState<string | null>(
    previewHomeId,
  );
  const saving = save.isPending ? (save.variables?.templateId ?? null) : null;
  const { card, format, current, cards, homes, pending, error, refetch } =
    useTemplatePreview(brandId, selectedHomeId);

  if (pending)
    return (
      <div role="status" aria-label="Loading catalog templates">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (error)
    return (
      <div className="space-y-2">
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  if (!card)
    return (
      <p className="text-sm text-muted-foreground">
        Include a home to preview catalog templates.
      </p>
    );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">Preview home</span>
        <Combobox
          className="w-full max-w-sm"
          triggerClassName="[&>svg]:ml-auto overflow-hidden text-left"
          value={card.homeId}
          onValueChange={(value) => {
            if (value) setSelectedHomeId(value);
          }}
          placeholder="Choose a preview home"
          searchPlaceholder="Search homes…"
          emptyText="No matching homes."
          options={cards.map((option) => {
            const home = homes.find((home) => home.id === option.homeId);
            const name = home?.name ?? option.title;
            return {
              value: option.homeId,
              label: name,
              keywords: [name],
              imageUrl: home?.thumbUrl ?? home?.imageUrl,
            };
          })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-4">
        {CATALOG_TEMPLATES.map((templateId) => {
          const label = templateLabel(templateId);
          const guide = CATALOG_COPY_INTENTS[templateId];
          const src = previewAtWidth(
            catalogCardPreviewUrl(
              brandId,
              asTemplate(card, templateId),
              format,
            ),
            240,
          );
          const chosen = current === templateId;
          return (
            <div
              key={templateId}
              className={cn(
                "space-y-2 rounded-lg border p-2 text-sm",
                chosen && "ring-2 ring-foreground",
              )}
            >
              <button
                type="button"
                aria-pressed={chosen}
                disabled={saving !== null}
                onClick={() => save.mutate({ brandId, templateId })}
                className="block w-full space-y-2 text-left"
              >
                {src && (
                  // oxlint-disable-next-line nextjs/no-img-element
                  <img
                    src={src}
                    alt={label}
                    className="aspect-square w-full rounded-md object-cover"
                  />
                )}
                <span className="block font-medium">
                  {label}
                  {chosen
                    ? " · default"
                    : saving === templateId
                      ? " · saving…"
                      : ""}
                </span>
              </button>
              {guide && <Guide guide={guide} />}
            </div>
          );
        })}
      </div>
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
  const title = isPlaceCard(templateId)
    ? at > 0 || !card.location
      ? card.title
      : `${card.title} in ${card.location}`
    : at > 0
      ? card.title.slice(0, at)
      : card.title;
  return { ...card, templateId, title };
}

/** A template's copy rules: the limits on one line, the brief clamped. */
function Guide({ guide }: { guide: CopyGuide }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        <GuideLimits guide={guide} />
      </p>
      <p
        className={cn("text-xs text-muted-foreground", !open && "line-clamp-2")}
      >
        {guide.intent}
      </p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium underline-offset-4 hover:underline"
      >
        {open ? "Show less" : "Show more"}
      </button>
    </div>
  );
}

type CopyGuide =
  (typeof CATALOG_COPY_INTENTS)[keyof typeof CATALOG_COPY_INTENTS];

function GuideLimits({ guide }: { guide: CopyGuide }) {
  return (
    <>
      Headline ≤{guide.headlineChars} characters
      {guide.placeSuffix
        ? " · ends “in {place}”"
        : " · no place in the headline"}
      {guide.pills ? ` · ${guide.pills} amenity pills` : ""}
    </>
  );
}
