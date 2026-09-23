import { homesSchema, cardsSchema } from "./shared";
import { z } from "zod";
import { appliedEvidenceSchema } from "@/lib/applied-evidence";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
export const listBrandsOutputSchema = z.strictObject({
  brands: z.array(
    z.strictObject({
      id: z.string(),
      name: z.string(),
      relationship: z.enum(["internal", "client", "prospect", "reference"]),
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

export const setPerformanceSettingsActionOutputSchema = z.strictObject({
  brandId: z.string(),
  changed: z.array(z.string()),
  ok: z.literal(true),
  path: z.string(),
  settings: z.strictObject({
    adCopiesUrl: z.string().nullable().optional(),
    adsConnectionBrandId: z.string().optional(),
    bookings: z.number().nullable().optional(),
    carouselCreativeUrl: z.string().nullable().optional(),
    catalogCreativeUrl: z.string().nullable().optional(),
    catalogStudio: z
      .strictObject({
        cards: z.array(cardsSchema),
        formats: z.array(
          z.enum(["story", "landscape", "square", "portrait", "wide"]),
        ),
        primaryFormat: z.enum([
          "story",
          "landscape",
          "square",
          "portrait",
          "wide",
        ]),
      })
      .optional(),
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
    reportEmails: z.string().nullable().optional(),
    socialMediaPosts: z.string().nullable().optional(),
    ugcPermission: z.string().nullable().optional(),
    updatedAt: z.string().optional(),
    updatedBy: z.string().nullable().optional(),
    updatedFrom: z.enum(["agent", "intake", "operator"]).optional(),
  }),
});

export const enrichBrandActionOutputSchema = z.strictObject({
  ...appliedEvidenceSchema.shape,
  brandId: z.string(),
  description: z.string().nullable(),
  logo: z.string().nullable(),
  name: z.string(),
  tagline: z.string().nullable(),
});
