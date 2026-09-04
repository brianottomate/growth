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
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(220).optional(),
  eyebrow: z.string().trim().max(40).optional(),
  cta: z.string().trim().max(60).optional(),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  imagePosition: z.enum(["top", "center", "bottom"]).default("center"),
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

export const compositionSpecSchema = z
  .object(compositionShape)
  .superRefine(requireSourceImage);

export const freezeCompositionSchema = z
  .object({
    ...compositionShape,
    assetTitle: z.string().trim().min(1).max(180),
  })
  .superRefine(requireSourceImage);

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
  };
}

export function getCompositionMetadata(
  spec: FreezeCompositionInput,
  renderedAt = new Date().toISOString(),
) {
  return { ...getCompositionIdentity(spec), renderedAt };
}
