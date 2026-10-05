import { catalogAdCopySchema } from "@/lib/catalog-studio";
import { homesSchema, metaReportingConversionsSchema } from "./shared";
import { z } from "zod";
import { STORED_PIPELINE_STAGES } from "@/lib/performance-pipeline";
import { performanceCardStateSchema } from "@/lib/performance-card-state";
import { appliedEvidenceSchema } from "@/lib/applied-evidence";
import type { PerformanceSettings } from "@/server/db/brand-schema";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
export const listBrandsOutputSchema = z.strictObject({
  brands: z.array(
    z.strictObject({
      id: z.string(),
      name: z.string(),
      relationship: z.enum(["internal", "client", "prospect", "reference"]),
      slug: z.string().nullable(),
      tagline: z.string().nullable(),
    }),
  ),
});

export const createBrandActionOutputSchema = z.strictObject({
  brandId: z.string(),
  name: z.string(),
  path: z.string(),
  slug: z.string().nullable(),
});

export const addBrandAdPreviewActionOutputSchema = z.strictObject({
  brandId: z.string(),
  count: z.number(),
  ok: z.literal(true),
  path: z.string(),
});

/**
 * Every settings key, checked against the type: a key added to
 * `PerformanceSettings` fails to compile here until the wire schema lists it,
 * rather than failing an MCP client's strict output check at runtime.
 */
const performanceSettingsShape = {
  cardState: performanceCardStateSchema.nullish(),
  note: z.string().nullable().optional(),
  noteEditedAt: z.string().optional(),
  noteEditedBy: z
    .strictObject({
      id: z.string().nullable(),
      name: z.string().nullable(),
      image: z.string().nullable(),
    })
    .nullish(),
  adCopiesUrl: z.string().nullable().optional(),
  adsConnectionBrandId: z.string().optional(),
  bookings: z.number().nullable().optional(),
  carouselCreativeUrl: z.string().nullable().optional(),
  catalogCreativeUrl: z.string().nullable().optional(),
  creativeDriveUrl: z.string().nullable().optional(),
  dedicatedNewsletter: z.string().nullable().optional(),
  guestListDriveUrl: z.string().nullable().optional(),
  heroCreativeUrl: z.string().nullable().optional(),
  homeInventory: z
    .strictObject({
      addressesFetchedAt: z.string().optional(),
      enrichmentError: z.string().optional(),
      homes: z.array(homesSchema),
      syncedAt: z.string(),
    })
    .optional(),
  influencer: z.string().nullable().optional(),
  logoOnCreatives: z.boolean().nullable().optional(),
  invoiceEmail: z.string().nullable().optional(),
  metaTrackingDefaults: z
    .record(
      z.string(),
      z.strictObject({ customEventType: z.string(), pixelId: z.string() }),
    )
    .optional(),
  metaReportingConversions: metaReportingConversionsSchema,
  agreedAdSpend: z.number().nullable().optional(),
  catalogFormatId: z.enum(["portrait", "square"]).nullable().optional(),
  catalogAd: catalogAdCopySchema.nullable().optional(),
  catalogTemplateId: z
    .enum([
      "catalog-place",
      "catalog-place-plain",
      "catalog-copy",
      "catalog-amenities",
      "catalog-amenities-place",
      "catalog-destination",
      "catalog-headline",
    ])
    .nullable()
    .optional(),
  effectiveDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  monthlyFee: z.number().nullable().optional(),
  reportEmails: z.string().nullable().optional(),
  siteLive: z.string().nullable().optional(),
  pipelineStage: z.enum(STORED_PIPELINE_STAGES).nullish(),
  socialMediaPosts: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  ugcPermission: z.string().nullable().optional(),
  updatedAt: z.string().optional(),
  updatedBy: z.string().nullable().optional(),
  updatedFrom: z.enum(["agent", "intake", "operator"]).optional(),
} satisfies Record<keyof PerformanceSettings, z.ZodType>;

export const performanceSettingsSchema = z.strictObject(
  performanceSettingsShape,
);

export const setPerformanceSettingsActionOutputSchema = z.strictObject({
  brandId: z.string(),
  changed: z.array(z.string()),
  ok: z.literal(true),
  path: z.string(),
  settings: performanceSettingsSchema,
});

export const getBrandOutputSchema = z.strictObject({
  brand: listBrandsOutputSchema.shape.brands.element.extend({
    website: z.string().nullable(),
    logo: z.string().nullable(),
    description: z.string().nullable(),
    story: z.string().nullable(),
    enrichment: z.strictObject({
      scrapedAt: z.string().nullable(),
      hasBrandIdentity: z.boolean(),
    }),
    performanceSettings: performanceSettingsSchema.nullable(),
  }),
});

export type GetBrandOutput = z.infer<typeof getBrandOutputSchema>;

export const enrichBrandActionOutputSchema = z.strictObject({
  ...appliedEvidenceSchema.shape,
  brandId: z.string(),
  description: z.string().nullable(),
  logo: z.string().nullable(),
  name: z.string(),
  tagline: z.string().nullable(),
});

export type BrandListResult = z.output<typeof listBrandsOutputSchema>;
