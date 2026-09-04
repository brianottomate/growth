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
  /** Where the field lands on the canvas, as fractions of width and height. */
  anchor: { x: number; y: number };
};

const mark = (x = 0.06, y = 0.05): CompositionField => ({
  key: "mark",
  label: "Mark",
  anchor: { x, y },
});
const message = (x: number, y: number, step = 0.06): CompositionField[] => [
  { key: "eyebrow", label: "Eyebrow", hint: "Optional", anchor: { x, y } },
  { key: "title", label: "Headline", anchor: { x, y: y + step } },
  { key: "subtitle", label: "Supporting copy", hint: "Optional", anchor: { x, y: y + step * 2.2 } },
  { key: "cta", label: "CTA", hint: "Optional", anchor: { x, y: y + step * 3.2 } },
];
const accent = (x: number, y: number, hint: string): CompositionField => ({
  key: "accent",
  label: "Accent",
  hint,
  anchor: { x, y },
});

/**
 * The fields each blueprint draws, and only those. The form is built from
 * this, so a field that exists on screen is a field the render reads, and the
 * label says what it means on that layout. Anchors place the numbered markers
 * on the preview; they are guidance, not the renderer's own geometry.
 */
export const COMPOSITION_FIELDS: Record<CompositionTemplateId, CompositionField[]> = {
  // The photo alone: nothing from the form reaches the canvas.
  "photo-only": [],
  "catalog-copy": [
    mark(),
    { key: "title", label: "Home name", anchor: { x: 0.06, y: 0.85 } },
    { key: "subtitle", label: "Facts", hint: "3 bedrooms · 2 baths · 8 guests", anchor: { x: 0.06, y: 0.94 } },
  ],
  "catalog-review": [
    mark(),
    { key: "title", label: "Guest quote", hint: "Without the quotation marks", anchor: { x: 0.06, y: 0.82 } },
    { key: "subtitle", label: "Guest", hint: "Who said it", anchor: { x: 0.06, y: 0.94 } },
    { key: "rating", label: "Stars", anchor: { x: 0.3, y: 0.94 } },
  ],
  "tall-statement": [
    mark(0.5, 0.05),
    { key: "title", label: "Headline", anchor: { x: 0.5, y: 0.3 } },
    { key: "subtitle", label: "Supporting line", hint: "Optional", anchor: { x: 0.5, y: 0.42 } },
    { key: "cta", label: "Call to action", hint: "Optional", anchor: { x: 0.5, y: 0.9 } },
  ],
  "tall-welcome": [
    mark(),
    { key: "title", label: "Headline", anchor: { x: 0.06, y: 0.62 } },
    { key: "subtitle", label: "Supporting line", hint: "Optional", anchor: { x: 0.06, y: 0.74 } },
    { key: "cta", label: "Button", hint: "Optional", anchor: { x: 0.06, y: 0.9 } },
  ],
  "image-hero": [mark(), ...message(0.06, 0.72)],
  "split-frame": [mark(), ...message(0.06, 0.3)],
  "editorial-overlay": [mark(), ...message(0.06, 0.66), accent(0.9, 0.94, "colours the CTA")],
  "product-proof": [mark(), ...message(0.06, 0.26), accent(0.86, 0.86, "colours the card edge")],
  "brand-statement": [mark(), ...message(0.06, 0.38), accent(0.9, 0.9, "warms the ground")],
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
  /** Stars on the review card. Drawn only by blueprints that show a review. */
  rating: z.number().int().min(1).max(5).optional(),
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
