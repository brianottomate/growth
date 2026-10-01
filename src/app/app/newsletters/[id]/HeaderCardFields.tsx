"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles, Undo2 } from "lucide-react";

import { orpc } from "@/orpc/client";
import type { EmailImage } from "./email-blocks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  EMAIL_HEADER_TEMPLATES,
  EMAIL_HEADER_SHAPES,
  type EmailHeaderShape,
  emailHeaderTemplateId,
  type EmailHeaderTemplateId,
} from "@/lib/email-header-compositions";

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
  const [templateId, setTemplateId] = useState<EmailHeaderTemplateId>(
    image.card ? emailHeaderTemplateId(image.card.templateId) : "photo-only",
  );
  const [shape, setShape] = useState<EmailHeaderShape>(
    image.card?.formatId ??
      (image.card && image.card.templateId !== "photo-only"
        ? "banner"
        : "original"),
  );
  const [card, setCard] = useState({
    eyebrow: image.card?.eyebrow ?? "",
    title: image.card?.title ?? "",
    detail: image.card?.detail ?? "",
  });
  const render = useMutation(
    orpc.newsletter.renderHeaderCard.mutationOptions(),
  );
  const source = image.card?.source ?? image.src;
  const plainPhoto = templateId === "photo-only";
  const chosen = EMAIL_HEADER_TEMPLATES.find(
    (template) => template.id === templateId,
  );
  const applyPhoto = () =>
    onChange({
      src: source,
      alt: image.alt,
      card: { source, templateId: "photo-only", ...card },
    });

  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg bg-muted/50 p-2">
      <Label htmlFor="email-header-template">Composition template</Label>
      <Select
        value={templateId}
        onValueChange={(value) => {
          const next = emailHeaderTemplateId(value);
          setTemplateId(next);
          if (next !== "photo-only" && shape === "original") setShape("banner");
        }}
        disabled={render.isPending}
      >
        <SelectTrigger id="email-header-template">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EMAIL_HEADER_TEMPLATES.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{chosen?.description}</p>
      <Label htmlFor="email-header-shape">Image shape</Label>
      <Select
        value={shape}
        onValueChange={(value) => setShape(value as EmailHeaderShape)}
        disabled={render.isPending}
      >
        <SelectTrigger id="email-header-shape">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EMAIL_HEADER_SHAPES.filter(
            (option) => plainPhoto || option.id !== "original",
          ).map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Landscape crops keep the header compact. The original photo is retained.
      </p>
      {!plainPhoto && (
        <>
          <Label htmlFor="email-header-eyebrow">Eyebrow · optional</Label>
          <input
            id="email-header-eyebrow"
            maxLength={60}
            value={card.eyebrow}
            onChange={(event) =>
              setCard({ ...card, eyebrow: event.target.value })
            }
            aria-label="Eyebrow"
            placeholder="Optional season or theme"
            className={`${input} text-xs`}
          />
          <Label htmlFor="email-header-title">Headline</Label>
          <input
            id="email-header-title"
            maxLength={90}
            value={card.title}
            onChange={(event) =>
              setCard({ ...card, title: event.target.value })
            }
            aria-label="Headline on the photo"
            placeholder="A short headline"
            className={input}
          />
          <Label htmlFor="email-header-detail">
            {templateId === "email-header"
              ? "Offer pill · optional"
              : "Supporting line · optional"}
          </Label>
          <input
            id="email-header-detail"
            maxLength={90}
            value={card.detail}
            onChange={(event) =>
              setCard({ ...card, detail: event.target.value })
            }
            aria-label={
              templateId === "email-header" ? "Offer pill" : "Supporting line"
            }
            placeholder={
              templateId === "email-header"
                ? "Optional offer or detail"
                : "Optional supporting copy"
            }
            className={`${input} text-xs`}
          />
        </>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={
            (!plainPhoto && !card.title.trim()) || !source || render.isPending
          }
          onClick={() => {
            if (plainPhoto && shape === "original") {
              applyPhoto();
              return;
            }
            render.mutate(
              {
                brandId,
                sourceUrl: source,
                templateId,
                formatId: shape === "original" ? "banner" : shape,
                eyebrow: card.eyebrow || undefined,
                title: plainPhoto
                  ? card.title.trim() || "Email photo"
                  : card.title,
                detail: card.detail || undefined,
              },
              {
                onSuccess: ({ url }) =>
                  onChange({
                    src: url,
                    alt: plainPhoto
                      ? image.alt
                      : [card.title, card.detail].filter(Boolean).join(". "),
                    card: {
                      source,
                      templateId,
                      formatId: shape === "original" ? "banner" : shape,
                      ...card,
                    },
                  }),
              },
            );
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {render.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {plainPhoto
            ? shape === "original"
              ? "Use original photo"
              : "Apply crop"
            : "Update composition"}
        </button>
        {image.card && !plainPhoto && (
          <button
            type="button"
            disabled={render.isPending}
            onClick={() => {
              setTemplateId("photo-only");
              setShape("original");
              applyPhoto();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent"
          >
            <Undo2 className="size-3.5" /> Plain photo
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Update the composition to preview it, then save the email revision to
        keep your changes.
      </p>
      {render.error && (
        <p className="text-xs text-destructive">{render.error.message}</p>
      )}
    </div>
  );
}
