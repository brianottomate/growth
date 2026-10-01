import { brandEmailThemeSchema } from "@/lib/brand-email-style";
import { contentStatusEnum } from "@/server/db/content-schema";
import { channelPlatformEnum } from "@/server/db/channel-schema";
import { z } from "zod";
import { compositionImagePositionSchema } from "@/lib/compositions";
import { jsonValueSchema } from "../../kernel/output";

/** Shared wire records used across capability result contracts. */
export const upcomingContentResultSchema = z.strictObject({
  posts: z.array(
    z.strictObject({
      brandId: z.string(),
      id: z.string(),
      pillar: z.string().nullable(),
      plannedAt: z.iso.datetime().nullable(),
      status: z.enum(contentStatusEnum.enumValues),
      title: z.string().nullable(),
    }),
  ),
  standalonePlatformPosts: z.array(
    z.strictObject({
      brandId: z.string(),
      id: z.string(),
      metadata: jsonValueSchema,
      pillar: z.string().nullable(),
      platform: z.enum(channelPlatformEnum.enumValues),
      scheduledAt: z.iso.datetime().nullable(),
      status: z.enum(contentStatusEnum.enumValues),
      text: z.string().nullable(),
      title: z.string(),
    }),
  ),
  window: z.strictObject({ from: z.string(), through: z.string() }),
});

export const productionQueueResultSchema = z.strictObject({
  brand: z.strictObject({ id: z.string(), name: z.string() }),
  items: z.array(
    z.strictObject({
      completed: z.number(),
      id: z.string(),
      next: z
        .strictObject({
          complete: z.boolean(),
          detail: z.string(),
          id: z.string(),
          label: z.string(),
        })
        .nullable(),
      plannedAt: z.iso.datetime().nullable(),
      platforms: z.array(z.enum(channelPlatformEnum.enumValues)),
      readyForReview: z.boolean(),
      status: z.enum(contentStatusEnum.enumValues),
      title: z.string().nullable(),
      total: z.number(),
      url: z.string(),
    }),
  ),
  window: z.strictObject({ from: z.string(), through: z.string() }),
});

export const cardsSchema = z.strictObject({
  assetId: z.string().optional(),
  finishedArtwork: z
    .strictObject({
      assetId: z.string(),
      format: z.enum(["story", "landscape", "square", "portrait", "wide"]),
      url: z.string(),
    })
    .optional(),
  homeId: z.string(),
  imagePosition: compositionImagePositionSchema,
  imageUrl: z.string(),
  included: z.boolean(),
  mode: z.enum(["compose", "finished"]).optional(),
  showLogo: z.boolean(),
  subtitle: z.string(),
  templateId: z.enum([
    "photo-only",
    "catalog-copy",
    "catalog-place",
    "catalog-place-plain",
    "catalog-amenities",
    "catalog-amenities-place",
    "catalog-destination",
    "catalog-headline",
    "catalog-review",
    "tall-statement",
    "tall-welcome",
    "hero-overlay",
    "image-hero",
    "split-frame",
    "editorial-overlay",
    "product-proof",
    "brand-statement",
  ]),
  title: z.string(),
});

export const homesSchema = z.strictObject({
  bathrooms: z.number().nullable().optional(),
  bedrooms: z.number().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  gallery: z
    .array(z.strictObject({ thumbUrl: z.string(), url: z.string() }))
    .optional(),
  guests: z.number().nullable().optional(),
  id: z.string(),
  imageUrl: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  name: z.string(),
  nightlyFrom: z.number().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  rating: z.number().optional(),
  state: z.string().nullable().optional(),
  streetAddress: z.string().nullable().optional(),
  streetAddress2: z.string().nullable().optional(),
  streetAddress3: z.string().nullable().optional(),
  thumbUrl: z.string().optional(),
  url: z.string(),
});

/** Brand legalIdentity. */
export const brandLegalIdentitySchema = z
  .strictObject({
    legalName: z.string().nullable().optional(),
    address: z
      .strictObject({
        line1: z.string(),
        line2: z.string().nullable().optional(),
        city: z.string(),
        region: z.string().nullable().optional(),
        postalCode: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    registration: z.string().nullable().optional(),
    vatId: z.string().nullable().optional(),
  })
  .nullable();

/** Brand emailSender. */
export const brandEmailSenderSchema = z
  .strictObject({
    theme: brandEmailThemeSchema.nullable().optional(),
    copyGuide: z.string().max(4000).nullable().optional(),
    fromName: z.string(),
    fromEmail: z.string().nullable().optional(),
    replyTo: z.string().nullable().optional(),
    logoUrl: z.string().nullable().optional(),
    tagline: z.string().nullable().optional(),
    siteUrl: z.string().nullable().optional(),
    siteCtaLabel: z.string().nullable().optional(),
    contact: z
      .strictObject({
        phone: z.string(),
        note: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
        heading: z.string().nullable().optional(),
        text: z.string().nullable().optional(),
        textLabel: z.string().nullable().optional(),
        callLabel: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    valueProps: z
      .array(z.strictObject({ iconUrl: z.string(), label: z.string() }))
      .nullable()
      .optional(),
  })
  .nullable();

/** Brand performanceSettings.metaReportingConversions, keyed by ad account. */
export const metaReportingConversionsSchema = z
  .record(
    z.string(),
    z.strictObject({
      customConversionId: z.string(),
      name: z.string(),
      host: z.string(),
      pixelId: z.string(),
      customEventType: z.string(),
    }),
  )
  .optional();
