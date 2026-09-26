import { homesSchema } from "./shared";
import { z } from "zod";
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
  invoiceEmail: z.string().nullable().optional(),
  metaTrackingDefaults: z
    .record(
      z.string(),
      z.strictObject({ customEventType: z.string(), pixelId: z.string() }),
    )
    .optional(),
  agreedAdSpend: z.number().nullable().optional(),
  catalogTemplateId: z
    .enum(["catalog-place", "catalog-copy"])
    .nullable()
    .optional(),
  effectiveDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  monthlyFee: z.number().nullable().optional(),
  reportEmails: z.string().nullable().optional(),
  siteLive: z.string().nullable().optional(),
  socialMediaPosts: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  ugcPermission: z.string().nullable().optional(),
  updatedAt: z.string().optional(),
  updatedBy: z.string().nullable().optional(),
  updatedFrom: z.enum(["agent", "intake", "operator"]).optional(),
} satisfies Record<keyof PerformanceSettings, z.ZodType>;

export const setPerformanceSettingsActionOutputSchema = z.strictObject({
  brandId: z.string(),
  changed: z.array(z.string()),
  ok: z.literal(true),
  path: z.string(),
  settings: z.strictObject(performanceSettingsShape),
});

export const enrichBrandActionOutputSchema = z.strictObject({
  ...appliedEvidenceSchema.shape,
  brandId: z.string(),
  description: z.string().nullable(),
  logo: z.string().nullable(),
  name: z.string(),
  tagline: z.string().nullable(),
});
