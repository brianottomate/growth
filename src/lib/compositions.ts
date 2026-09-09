import { z } from "zod";

export const COMPOSITION_FORMATS = [
  {
    id: "landscape",
    label: "Landscape",
    detail: "Links · 1.91:1",
    width: 1200,
    height: 630,
  },
  {
    id: "square",
    label: "Square",
    detail: "Feeds · 1:1",
    width: 1080,
    height: 1080,
  },
  {
    id: "portrait",
    label: "Portrait",
    detail: "Feeds · 4:5",
    width: 1080,
    height: 1350,
  },
  {
    id: "story",
    label: "Story",
    detail: "Stories · 9:16",
    width: 1080,
    height: 1920,
  },
] as const;

export const COMPOSITION_TEMPLATES = [
  {
    id: "photo-only",
    version: 1,
    label: "Photo only",
    description:
      "The source image alone, full-bleed. The baseline every other blueprint adds to.",
  },
  {
    id: "catalog-copy",
    version: 1,
    label: "Catalog · copy",
    description:
      "Logo top left, the home's name and facts over a dark gradient at the foot. The feed card.",
  },
  {
    id: "catalog-place",
    version: 2,
    label: "Catalog · place",
    description:
      "One bold statement, the hook and the place, then the facts and a guest-rating pill over a dark foot gradient. No mark: the feed shows the brand above the card. The listing card.",
  },
  {
    id: "catalog-review",
    version: 1,
    label: "Catalog · review",
    description:
      "Same photo treatment, a guest quote and their stars at the foot instead of facts.",
  },
  {
    id: "tall-statement",
    version: 1,
    label: "Tall · statement",
    description:
      "Logo and a centred headline high on the photo, a quiet call to action at the base. Stories and Reels.",
  },
  {
    id: "tall-welcome",
    version: 1,
    label: "Tall · welcome",
    description:
      "Left-set headline and supporting line under the logo, a pill button at the base.",
  },
  {
    id: "image-hero",
    version: 2,
    label: "Image hero",
    description:
      "A full-bleed image with a restrained, readable message block.",
  },
  {
    id: "split-frame",
    version: 2,
    label: "Split frame",
    description:
      "Copy and a framed source image share the canvas. Good for product UI.",
  },
  {
    id: "editorial-overlay",
    version: 2,
    label: "Editorial overlay",
    description:
      "Large type over an atmospheric crop. Good for property and campaign work.",
  },
  {
    id: "product-proof",
    version: 2,
    label: "Product proof",
    description:
      "A restrained copy column with a product card entering from the lower right.",
  },
  {
    id: "brand-statement",
    version: 1,
    label: "Brand statement",
    description:
      "A type-led composition that can stand alone without source media.",
  },
] as const;

export type CompositionFormatId = (typeof COMPOSITION_FORMATS)[number]["id"];
export type CompositionTemplateId =
  (typeof COMPOSITION_TEMPLATES)[number]["id"];

export type CompositionFieldKey =
  | "mark"
  | "eyebrow"
  | "title"
  | "subtitle"
  | "cta"
  | "accent"
  | "rating";

export type CompositionField = {
  key: CompositionFieldKey;
  /** What the field is called on this blueprint: "Home name", not "Headline". */
  label: string;
  hint?: string;
};

const mark: CompositionField = { key: "mark", label: "Mark" };
const message: CompositionField[] = [
  { key: "eyebrow", label: "Eyebrow", hint: "Optional" },
  { key: "title", label: "Headline" },
  { key: "subtitle", label: "Supporting copy", hint: "Optional" },
  { key: "cta", label: "CTA", hint: "Optional" },
];
const accent = (hint: string): CompositionField => ({ key: "accent", label: "Accent", hint });

/**
 * The fields each blueprint draws, and only those. The form is built from
 * this, so a field that exists on screen is a field the render reads, and the
 * label says what it means on that layout.
 */
export const COMPOSITION_FIELDS: Record<CompositionTemplateId, CompositionField[]> = {
  // The photo alone: nothing from the form reaches the canvas.
  "photo-only": [],
  "catalog-copy": [
    mark,
    { key: "title", label: "Home name" },
    { key: "subtitle", label: "Facts", hint: "3 bedrooms · 2 baths · 8 guests" },
  ],
  "catalog-place": [
    { key: "eyebrow", label: "Lead-in", hint: "Arcade games & firepit in" },
    { key: "title", label: "Place", hint: "Winter Park, CO" },
    { key: "subtitle", label: "Facts", hint: "3 bedrooms · 3.5 baths · 14 guests" },
    { key: "rating", label: "Guest rating", hint: "4.9" },
    accent("colours the rating pill"),
  ],
  "catalog-review": [
    mark,
    { key: "title", label: "Guest quote", hint: "Without the quotation marks" },
    { key: "subtitle", label: "Guest", hint: "Who said it" },
    { key: "rating", label: "Stars" },
  ],
  // Centred, so the layout skips the supporting line.
  "tall-statement": [
    mark,
    { key: "title", label: "Headline" },
    { key: "cta", label: "Call to action", hint: "Optional" },
  ],
  "tall-welcome": [
    mark,
    { key: "title", label: "Headline" },
    { key: "subtitle", label: "Supporting line", hint: "Optional" },
    { key: "cta", label: "Button", hint: "Optional" },
  ],
  "image-hero": [mark, ...message],
  "split-frame": [mark, ...message],
  "editorial-overlay": [mark, ...message, accent("colours the CTA")],
  "product-proof": [mark, ...message, accent("colours the card edge")],
  "brand-statement": [mark, ...message, accent("warms the ground")],
};

export function getCompositionFields(id: CompositionTemplateId) {
  return COMPOSITION_FIELDS[id];
}

export function compositionHasField(
  id: CompositionTemplateId,
  key: CompositionFieldKey,
) {
  return COMPOSITION_FIELDS[id].some((field) => field.key === key);
}

const templateIds = COMPOSITION_TEMPLATES.map((template) => template.id) as [
  CompositionTemplateId,
  ...CompositionTemplateId[],
];
const formatIds = COMPOSITION_FORMATS.map((format) => format.id) as [
  CompositionFormatId,
  ...CompositionFormatId[],
];

export const compositionFormatIdSchema = z.enum(formatIds);
export const compositionTemplateIdSchema = z.enum(templateIds);

const compositionShape = {
  brandId: z.string().min(1),
  templateId: z.enum(templateIds),
  formatId: z.enum(formatIds),
  sourceMediaAssetId: z.string().min(1).optional(),
  title: z.string().trim().max(120),
  subtitle: z.string().trim().max(220).optional(),
  eyebrow: z.string().trim().max(40).optional(),
  cta: z.string().trim().max(60).optional(),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  imagePosition: z.enum(["top", "center", "bottom"]).default("center"),
  /**
   * The point of the photo that must stay in frame, as percentages of its
   * width and height. Set by the art director from what the crop cut off;
   * overrides `imagePosition` when present.
   */
  focal: z
    .object({
      x: z.number().int().min(0).max(100),
      y: z.number().int().min(0).max(100),
    })
    .optional(),
  /**
   * Colour of the darkening on catalog cards. Black by default; a deep tint of
   * the photo's own hue (a navy over sky, a green over forest) where the art
   * director asked for one. Always clamped dark enough to keep the type legible.
   */
  scrim: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  /**
   * Guest rating, 1 to 5 with one decimal: stars on the review card, a
   * "4.9 guest rating" pill on the place card.
   */
  rating: z.number().min(1).max(5).multipleOf(0.1).optional(),
  /**
   * Which version of the brand mark a card draws. `auto` picks white over a
   * photo and colour on a light ground; the rest force it or drop it.
   */
  mark: z.enum(["auto", "color", "white", "dark", "none"]).default("auto"),
};

function requireSourceImage(
  value: { templateId: CompositionTemplateId; sourceMediaAssetId?: string },
  context: z.RefinementCtx,
) {
  if (value.templateId !== "brand-statement" && !value.sourceMediaAssetId) {
    context.addIssue({
      code: "custom",
      path: ["sourceMediaAssetId"],
      message: "This blueprint needs a source image",
    });
  }
}

// Photo only draws no copy, so it is the one blueprint a headline is not
// required for. Every other template puts the title on the canvas.
function requireTitle(
  value: { templateId: CompositionTemplateId; title: string },
  context: z.RefinementCtx,
) {
  if (value.templateId !== "photo-only" && value.title.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["title"],
      message: "This blueprint needs a headline",
    });
  }
}

export const compositionSpecSchema = z
  .object(compositionShape)
  .superRefine(requireSourceImage)
  .superRefine(requireTitle);

export const freezeCompositionSchema = z
  .object({
    ...compositionShape,
    assetTitle: z.string().trim().min(1).max(180),
  })
  .superRefine(requireSourceImage)
  .superRefine(requireTitle);

export type CompositionSpec = z.infer<typeof compositionSpecSchema>;
export type FreezeCompositionInput = z.infer<typeof freezeCompositionSchema>;

export function getCompositionFormat(id: CompositionFormatId) {
  return COMPOSITION_FORMATS.find((format) => format.id === id)!;
}

export function getCompositionTemplate(id: CompositionTemplateId) {
  return COMPOSITION_TEMPLATES.find((template) => template.id === id)!;
}

/**
 * Everything that makes one render differ from another. Two specs with the
 * same identity produce the same PNG, so a caller can reuse the earlier one.
 * The template version is part of it: bumping a template must miss.
 */
export function getCompositionIdentity(spec: FreezeCompositionInput) {
  const template = getCompositionTemplate(spec.templateId);
  const format = getCompositionFormat(spec.formatId);
  return {
    templateId: template.id,
    templateVersion: template.version,
    formatId: format.id,
    sourceMediaAssetId: spec.sourceMediaAssetId ?? null,
    title: spec.title,
    subtitle: spec.subtitle ?? null,
    eyebrow: spec.eyebrow ?? null,
    cta: spec.cta ?? null,
    accent: spec.accent ?? null,
    imagePosition: spec.imagePosition,
    focal: spec.focal ?? null,
    scrim: spec.scrim ?? null,
    rating: spec.rating ?? null,
    mark: spec.mark,
  };
}

export function getCompositionMetadata(
  spec: FreezeCompositionInput,
  renderedAt = new Date().toISOString(),
) {
  return { ...getCompositionIdentity(spec), renderedAt };
}
