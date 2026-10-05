import { z } from "zod";

import {
  catalogAdCopySchema,
  CATALOG_TEMPLATES,
  CATALOG_WRITE_PASSES,
  catalogCardSchema,
  catalogExportSchema,
  CATALOG_FORMATS,
} from "@/lib/catalog-studio";
import { compositionFormatIdSchema } from "@/lib/compositions";
import { workflowRunStatusEnum } from "@/server/db/creative-work-schema";

const address = {
  streetAddress: z.string().nullable().optional(),
  streetAddress2: z.string().nullable().optional(),
  streetAddress3: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
};

const catalogHomeSchema = z.strictObject({
  ...address,
  id: z.string().describe("The WanderOS listing id."),
  name: z.string(),
  slug: z.string().optional(),
  reviewCount: z.number().nullable().optional(),
  url: z.string(),
  imageUrl: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  bedrooms: z.number().nullable().optional(),
  bathrooms: z.number().nullable().optional(),
  guests: z.number().nullable().optional(),
  nightlyFrom: z.number().nullable().optional(),
  amenities: z.array(z.string()).nullable().optional(),
  rating: z.number().optional(),
  thumbUrl: z.string().optional(),
  gallery: z
    .array(
      z.strictObject({
        url: z.string(),
        thumbUrl: z.string(),
        room: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

export const catalogStateActionOutputSchema = z.strictObject({
  homes: z.array(catalogHomeSchema),
  enrichmentError: z.string().optional(),
  syncedAt: z.string(),
  defaultTemplate: z.enum(CATALOG_TEMPLATES),
  format: z.enum(CATALOG_FORMATS),
  draft: z.strictObject({
    cards: z.array(catalogCardSchema),
    formats: z.array(compositionFormatIdSchema),
    primaryFormat: compositionFormatIdSchema,
    ad: catalogAdCopySchema.optional(),
  }),
  unwritten: z
    .array(z.string())
    .describe(
      "Listing ids of the included cards still on their starter headline: nobody wrote, approved or supplied artwork for them.",
    ),
  exports: z.array(catalogExportSchema),
});

const catalogWriteRunSchema = z.strictObject({
  runId: z.string(),
  pass: z.enum(CATALOG_WRITE_PASSES),
  status: z.enum(workflowRunStatusEnum.enumValues),
  error: z.string().nullable(),
  done: z.number(),
  total: z.number(),
  failed: z.number(),
  left: z
    .number()
    .describe("Cards the run ran out of time for; run the pass again."),
  createdAt: z.string(),
});

export const catalogWriteStatusActionOutputSchema = z.strictObject({
  run: catalogWriteRunSchema.nullable(),
});

export const writeCatalogCardsActionOutputSchema = z.strictObject({
  started: z
    .boolean()
    .describe("False when a run was already going; that run is returned."),
  run: catalogWriteRunSchema,
});

export const newCatalogCopyActionOutputSchema = z.strictObject({
  homeId: z.string(),
  headline: z.string(),
  pills: z.array(z.string()),
  reason: z.string(),
  showPhoto: z
    .strictObject({ number: z.number(), url: z.string() })
    .nullable()
    .describe(
      "A listing photo that shows what the headline sells better than the card's, to offer as the hero; null when the card's photo already does.",
    ),
});

export const newCatalogPhotoActionOutputSchema = z.strictObject({
  homeId: z.string(),
  photoNumber: z.number().nullable(),
  heroUrl: z.string().nullable(),
  reason: z.string(),
});

export const setCatalogApprovalActionOutputSchema = z.strictObject({
  updated: z.number(),
});

export const setCatalogIncludedActionOutputSchema = z.strictObject({
  brandId: z.string(),
  included: z.boolean(),
});

export const setCatalogAdCopyActionOutputSchema = z.strictObject({
  brandId: z.string(),
  ad: catalogAdCopySchema,
});

export const setCatalogDefaultTemplateActionOutputSchema = z.strictObject({
  brandId: z.string(),
  templateId: z.enum(CATALOG_TEMPLATES),
});

export const deleteCatalogExportActionOutputSchema = z.strictObject({
  runId: z.string(),
  images: z.number(),
});

export const exportCatalogActionOutputSchema = z.strictObject({
  runId: z.string(),
});

export type CatalogStateResult = z.output<
  typeof catalogStateActionOutputSchema
>;
