"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles, Undo2 } from "lucide-react";

import { orpc } from "@/orpc/client";
import type { EmailImage } from "./email-blocks";

const input =
  "bg-background border-input focus:ring-ring/30 w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none focus:ring-2";

/**
 * Turn an email photo into a header card, the offer set on the photo
 * (the email-header composition), or back into the plain photo.
 */
export function HeaderCardFields({
  brandId,
  image,
  onChange,
}: {
  brandId: string;
  image: EmailImage;
  onChange: (next: EmailImage) => void;
}) {
  const [card, setCard] = useState({
    eyebrow: image.card?.eyebrow ?? "",
    title: image.card?.title ?? "",
    detail: image.card?.detail ?? "",
  });
  const render = useMutation(
    orpc.newsletter.renderHeaderCard.mutationOptions(),
  );
  const source = image.card?.source ?? image.src;

  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg bg-muted/50 p-2">
      <p className="text-xs font-medium">Header card</p>
      <input
        value={card.eyebrow}
        onChange={(event) => setCard({ ...card, eyebrow: event.target.value })}
        aria-label="Eyebrow"
        placeholder="Eyebrow · Christmas & New Year's"
        className={`${input} text-xs`}
      />
      <input
        value={card.title}
        onChange={(event) => setCard({ ...card, title: event.target.value })}
        aria-label="Headline on the photo"
        placeholder="Headline · The big homes go first"
        className={input}
      />
      <input
        value={card.detail}
        onChange={(event) => setCard({ ...card, detail: event.target.value })}
        aria-label="Offer pill"
        placeholder="Offer · $150 off 5+ nights · code WPE-HOLIDAY"
        className={`${input} text-xs`}
      />
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={!card.title.trim() || !source || render.isPending}
          onClick={() =>
            render.mutate(
              {
                brandId,
                sourceUrl: source,
                eyebrow: card.eyebrow || undefined,
                title: card.title,
                detail: card.detail || undefined,
              },
              {
                onSuccess: ({ url }) =>
                  onChange({
                    src: url,
                    alt: [card.title, card.detail].filter(Boolean).join(". "),
                    card: { source, ...card },
                  }),
              },
            )
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {render.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {image.card ? "Update card" : "Make header card"}
        </button>
        {image.card && (
          <button
            type="button"
            onClick={() =>
              onChange({ src: image.card!.source, alt: image.alt })
            }
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent"
          >
            <Undo2 className="size-3.5" /> Plain photo
          </button>
        )}
      </div>
      {render.error && (
        <p className="text-xs text-destructive">{render.error.message}</p>
      )}
    </div>
  );
}
