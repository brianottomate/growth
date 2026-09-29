import { z } from "zod";

import {
  CATALOG_TEMPLATES,
  CATALOG_WRITE_PASSES,
  catalogCardSchema,
  CATALOG_FORMATS,
} from "@/lib/catalog-studio";
import { compositionFormatIdSchema } from "@/lib/compositions";
import { creativeRunStatusEnum } from "@/server/db/creative-work-schema";

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
    .array(z.strictObject({ url: z.string(), thumbUrl: z.string() }))
    .optional(),
});

const catalogExportSchema = z.strictObject({
  id: z.string(),
  status: z.string(),
  createdAt: z.string(),
  error: z.string().nullable(),
  folderId: z.string().optional(),
  completed: z.number().optional(),
  total: z.number().optional(),
  assets: z
    .array(
      z.strictObject({
        homeId: z.string(),
        name: z.string(),
        assetId: z.string(),
        url: z.string(),
        format: z.string(),
      }),
    )
    .optional(),
  rows: z
    .array(
      z.strictObject({
        ...address,
        id: z.string(),
        brand: z.string(),
        description: z.string(),
        title: z.string(),
        link: z.string(),
        imageUrl: z.string(),
        city: z.string(),
        region: z.string(),
        country: z.string(),
        price: z.string(),
        bedrooms: z.number().nullable(),
        guests: z.number().nullable(),
      }),
    )
    .optional(),
  label: z.string().optional(),
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
  status: z.enum(creativeRunStatusEnum.enumValues),
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

export const setCatalogDefaultTemplateActionOutputSchema = z.strictObject({
  brandId: z.string(),
  templateId: z.enum(CATALOG_TEMPLATES),
});

export const exportCatalogActionOutputSchema = z.strictObject({
  runId: z.string(),
});
