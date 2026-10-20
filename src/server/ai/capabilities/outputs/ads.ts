import {
  deliveryGroupConfigurationSchema,
  deliveryGeographySchema,
} from "@/lib/platform-delivery";
export {
  adsScopeOutputSchema,
  previewAdActionOutputSchema,
  listCampaignsActionOutputSchema,
} from "@/server/contracts/ad-tool-output";
import {
  ideaCopySchema,
  ideaDocumentSchema,
  ideaShapeSchema,
} from "@/lib/ad-idea-studio";
import { catalogCardSchema } from "@/lib/catalog-studio";
import { marketSchema } from "@/lib/markets";
import {
  compositionImagePositionSchema,
  compositionTemplateIdSchema,
} from "@/lib/compositions";
import { campaignStatusEnum } from "@/server/db/ads-schema";
import { audienceTypeEnum } from "@/server/db/ads-schema";
import { platformCampaignStatusEnum } from "@/server/db/ads-schema";
import { brandRelationshipEnum } from "@/server/db/brand-schema";
import { adStatusEnum } from "@/server/db/ads-schema";
import { channelPlatformEnum } from "@/server/db/channel-schema";
import { homesSchema, metaReportingConversionsSchema } from "./shared";
import { z } from "zod";
import { jsonValueSchema } from "../../kernel/output";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
const creativePoolItemSchema = z.strictObject({
  assetId: z.string().optional(),
  derivedFrom: z.string().optional(),
  height: z.number().optional(),
  thumbnail: z.string().optional(),
  type: z.enum(["image", "video", "carousel"]),
  url: z.string(),
  width: z.number().optional(),
});

const stepItemSchema = z.strictObject({
  assetId: z.string().optional(),
  cardUrl: z.string().optional(),
  changes: z.array(z.string()).optional(),
  name: z.string(),
  note: z.string().optional(),
  status: z.enum(["reused", "pending", "failed", "done", "rendering"]),
  url: z.string(),
});

const homesRunSchema = z.strictObject({
  adIds: z.array(z.string()),
  error: z.string().optional(),
  finishedAt: z.string().optional(),
  notes: z.array(z.string()),
  startedAt: z.string(),
  status: z.enum(["running", "failed", "done"]),
  steps: z.array(stepItemSchema),
});

const campaignSchema = z.strictObject({
  bookingTargetId: z.string().nullable(),
  brandId: z.string(),
  budget: z.number().nullable(),
  color: z.string().nullable(),
  createdAt: z.iso.datetime(),
  creativePool: z.array(creativePoolItemSchema).nullable(),
  deletedAt: z.iso.datetime().nullable(),
  description: z.string().nullable(),
  endAt: z.iso.datetime().nullable(),
  goal: z.string().nullable(),
  homesRun: homesRunSchema.nullable(),
  id: z.string(),
  landingUrl: z.string().nullable(),
  name: z.string(),
  performanceCycleId: z.string().nullable(),
  slug: z.string().nullable(),
  startAt: z.iso.datetime().nullable(),
  status: z.enum(campaignStatusEnum.enumValues),
  updatedAt: z.iso.datetime(),
});

const adAccountSchema = z.strictObject({
  currency: z.string().optional(),
  id: z.string(),
  minimumDailyBudget: z.number().optional(),
  name: z.string().optional(),
});

const brandSchema = z.strictObject({
  id: z.string(),
  metaPageId: z.string().nullable(),
  name: z.string(),
  slug: z.string().nullable(),
  zernioProfileId: z.string().nullable(),
});

const creativeSchema = z
  .strictObject({
    body: z.string().nullable().optional(),
    effectiveInstagramMediaId: z.string().optional(),
    effectiveObjectStoryId: z.string().optional(),
    imageUrl: z.string().nullable().optional(),
    instagramPermalinkUrl: z.string().optional(),
    instagramUserId: z.string().optional(),
    linkUrl: z.string().nullable().optional(),
    mediaUrls: z.array(z.string()).optional(),
    thumbnailUrl: z.string().nullable().optional(),
    videoId: z.string().nullable().optional(),
    videoUrl: z.string().nullable().optional(),
  })
  .catchall(jsonValueSchema);

const metricsSchema = z
  .strictObject({
    actions: z.record(z.string(), z.number()).optional(),
    clicks: z.number().optional(),
    conversions: z.number().optional(),
    engagement: z.number().optional(),
    impressions: z.number().optional(),
    reach: z.number().optional(),
    spend: z.number().optional(),
  })
  .catchall(jsonValueSchema);

const adSchema = z
  .strictObject({
    _id: z.string().optional(),
    adSetStatus: z.string().optional(),
    bidStrategy: z.string().optional(),
    budget: z
      .strictObject({
        amount: z.number().optional(),
        type: z.string().optional(),
      })
      .optional(),
    campaignStatus: z.string().optional(),
    createdAt: z.string().optional(),
    creative: creativeSchema.optional(),
    effectiveObjectStoryId: z.string().optional(),
    effectiveStoryId: z.string().optional(),
    id: z.string().optional(),
    isExternal: z.boolean().optional(),
    metrics: metricsSchema.optional(),
    name: z.string().optional(),
    optimizationGoal: z.string().optional(),
    platform: z.string().optional(),
    platformAdAccountId: z.string().optional(),
    platformAdAccountName: z.string().optional(),
    platformAdId: z.string().optional(),
    platformAdSetId: z.string().optional(),
    platformCampaignId: z.string().optional(),
    platformCreatedAt: z.string().optional(),
    platformId: z.string().optional(),
    platformObjective: z.string().optional(),
    status: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .catchall(jsonValueSchema);

const providerSchema = z
  .strictObject({
    ad: adSchema.optional(),
    ads: z.array(adSchema).optional(),
    message: z.string().optional(),
    platformAdSetId: z.string().optional(),
    platformCampaignId: z.string().optional(),
  })
  .catchall(jsonValueSchema);

const rendersSchema = z.strictObject({
  portrait: z
    .array(
      z.strictObject({
        assetId: z.string(),
        reused: z.literal(true).optional(),
        url: z.string(),
      }),
    )
    .optional(),
  square: z
    .array(
      z.strictObject({
        assetId: z.string(),
        reused: z.literal(true).optional(),
        url: z.string(),
      }),
    )
    .optional(),
  story: z
    .array(
      z.strictObject({
        assetId: z.string(),
        reused: z.literal(true).optional(),
        url: z.string(),
      }),
    )
    .optional(),
  wide: z
    .array(
      z.strictObject({
        assetId: z.string(),
        reused: z.literal(true).optional(),
        url: z.string(),
      }),
    )
    .optional(),
});

const approvalSchema = z.strictObject({
  approvedAt: z.string(),
  approvedBy: z.string(),
  renders: rendersSchema,
  sourceVersion: z.string(),
  brand: z.record(z.string(), jsonValueSchema).optional(),
});

const portraitSchema = z.strictObject({
  cta: z.string(),
  eyebrow: z.string(),
  imagePosition: compositionImagePositionSchema,
  showLogo: z.boolean(),
  subtitle: z.string(),
  templateId: compositionTemplateIdSchema,
  title: z.string(),
});

const overridesSchema = z.strictObject({
  portrait: portraitSchema.optional(),
  square: portraitSchema.optional(),
  story: portraitSchema.optional(),
  wide: portraitSchema.optional(),
});

const sourceSchema = z.strictObject({
  assetId: z.string().optional(),
  homeId: z.string().optional(),
  label: z.string().optional(),
  url: z.string(),
});

const sourceOverridesSchema = z.strictObject({
  portrait: sourceSchema.nullable().optional(),
  square: sourceSchema.nullable().optional(),
  story: sourceSchema.nullable().optional(),
  wide: sourceSchema.nullable().optional(),
});

const cardItemSchema = z.strictObject({
  copy: z
    .strictObject({
      headline: z.string().optional(),
      description: z.string().optional(),
      landingUrl: z.string().optional(),
      bookingTargetId: z.string().optional(),
    })
    .optional(),
  id: z.string(),
  mode: z.enum(["supplied", "compose"]),
  overrides: overridesSchema,
  recipe: portraitSchema,
  source: sourceSchema,
  sourceOverrides: sourceOverridesSchema.optional(),
});

const copyOverridesSchema = z.strictObject({
  portrait: z
    .strictObject({
      body: z.string(),
      callToAction: z.string(),
      headline: z.string(),
      description: z.string().optional(),
      bookingTargetId: z.string().nullable().optional(),
      linkUrl: z.string(),
    })
    .optional(),
  square: z
    .strictObject({
      body: z.string(),
      callToAction: z.string(),
      headline: z.string(),
      description: z.string().optional(),
      bookingTargetId: z.string().nullable().optional(),
      linkUrl: z.string(),
    })
    .optional(),
  story: z
    .strictObject({
      body: z.string(),
      callToAction: z.string(),
      headline: z.string(),
      description: z.string().optional(),
      bookingTargetId: z.string().nullable().optional(),
      linkUrl: z.string(),
    })
    .optional(),
  wide: z
    .strictObject({
      body: z.string(),
      callToAction: z.string(),
      headline: z.string(),
      description: z.string().optional(),
      bookingTargetId: z.string().nullable().optional(),
      linkUrl: z.string(),
    })
    .optional(),
});

const documentSchema = z.strictObject({
  cards: z.array(cardItemSchema),
  copy: z.strictObject({
    body: z.string(),
    callToAction: z.string(),
    headline: z.string(),
    description: z.string().optional(),
    bookingTargetId: z.string().nullable().optional(),
    linkUrl: z.string(),
  }),
  copyOverrides: copyOverridesSchema,
  exportShapes: z
    .array(z.enum(["story", "square", "portrait", "wide"]))
    .optional(),
  intendedPlacements: z
    .array(
      z.enum([
        "facebook-feed",
        "instagram-feed",
        "facebook-story",
        "instagram-story",
        "facebook-reel",
        "instagram-reel",
        "facebook-marketplace",
        "facebook-right-column",
        "facebook-profile-feed",
        "facebook-notification",
        "instagram-explore",
        "instagram-explore-home",
        "instagram-profile-feed",
        "instagram-profile-reel",
      ]),
    )
    .optional(),
  pool: z.array(sourceSchema).optional(),
  role: z.enum(["hero_carousel", "hero_static", "home_carousel"]),
  shapes: z.array(z.enum(["story", "square", "portrait", "wide"])),
});

const ideaStudioSchema = z.strictObject({
  approval: approvalSchema.optional(),
  document: documentSchema,
});

const storySchema = z.strictObject({
  headline: z.string().optional(),
  description: z.string().optional(),
  landingUrl: z.string().optional(),
  bookingTargetId: z.string().optional(),
  assetId: z.string().optional(),
  derivedFrom: z.string().optional(),
  height: z.number().optional(),
  thumbnail: z.string().optional(),
  type: z.enum(["image", "video", "carousel"]),
  url: z.string(),
  via: z.enum(["crop", "extend", "render", "upload"]),
  width: z.number().optional(),
});

const mediaItemSchema = z.strictObject({
  headline: z.string().optional(),
  description: z.string().optional(),
  landingUrl: z.string().optional(),
  bookingTargetId: z.string().optional(),
  assetId: z.string().optional(),
  derivedFrom: z.string().optional(),
  height: z.number().optional(),
  story: storySchema.optional(),
  thumbnail: z.string().optional(),
  type: z.enum(["image", "video", "carousel"]),
  url: z.string(),
  width: z.number().optional(),
});

const metaImportSchema = z.strictObject({
  adId: z.string(),
  campaignId: z.string(),
  creativeId: z.string(),
  importedAt: z.string(),
  issues: z.array(z.string()),
  rawCreative: z.record(z.string(), jsonValueSchema),
});

const contentSchema = z.strictObject({
  body: z.string(),
  bookingTargetId: z.string().nullable().optional(),
  description: z.string().optional(),
  callToAction: z.string().optional(),
  format: z
    .enum(["video", "carousel", "static", "portfolio", "catalog"])
    .optional(),
  headline: z.string(),
  ideaStudio: ideaStudioSchema.optional(),
  linkUrl: z.string().optional(),
  media: z.array(mediaItemSchema),
  metaImport: metaImportSchema.optional(),
  photoOnly: z.boolean().optional(),
  propertyName: z.string().optional(),
});

const copySchema = z.strictObject({
  body: z.string().optional(),
  bookingTargetId: z.string().nullable().optional(),
  description: z.string().optional(),
  callToAction: z.string().optional(),
  headline: z.string().optional(),
  linkUrl: z.string().optional(),
});

const placementsValueSchema = z.strictObject({
  cards: z.array(storySchema.nullable()).optional(),
  copy: copySchema.optional(),
  frozenAt: z.string().optional(),
  frozenBy: z.string().optional(),
  note: z.string().optional(),
  updatedAt: z.string().optional(),
  via: z.enum(["manual", "ai", "director"]).optional(),
});

const placementsSchema = z.record(z.string(), placementsValueSchema);

const pushedCreativeSchema = z.strictObject({
  name: z.string(),
  headline: z.string().nullable(),
  body: z.string().nullable(),
  linkUrl: z.string().nullable(),
  media: z.array(mediaItemSchema).nullable(),
  copy: z
    .strictObject({
      headlines: z.array(z.string()),
      descriptions: z.array(z.string()),
    })
    .nullable(),
});

export const draftAdResultSchema = z.strictObject({
  bookingTargetId: z.string().nullable(),
  brandId: z.string(),
  businessKey: z.string().nullable(),
  campaignId: z.string().nullable(),
  content: z.union([
    contentSchema.extend({
      // Provider snapshots stay unknown natively; wire validation checks JSON values.
      metaImport: metaImportSchema
        .extend({
          rawCreative: z.record(z.string(), z.unknown()),
        })
        .optional(),
    }),
    z.strictObject({
      descriptions: z.array(z.string()),
      headlines: z.array(z.string()),
      linkUrl: z.string().optional(),
    }),
  ]),
  createdAt: z.date(),
  homeId: z.string().nullable(),
  id: z.string(),
  name: z.string(),
  placements: placementsSchema.nullable(),
  platforms: z.array(z.enum(channelPlatformEnum.enumValues)).nullable(),
  status: z.enum(adStatusEnum.enumValues),
  readyAt: z.date().nullable(),
  readyBy: z.string().nullable(),
  approvedAt: z.date().nullable(),
  approvedBy: z.string().nullable(),
  replacesAdId: z.string().nullable(),
  type: z.enum(["text", "creative"]),
  updatedAt: z.date(),
});

const draftAdSchema = draftAdResultSchema.extend({
  content: z.union([
    contentSchema,
    z.strictObject({
      descriptions: z.array(z.string()),
      headlines: z.array(z.string()),
      linkUrl: z.string().optional(),
    }),
  ]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  readyAt: z.iso.datetime().nullable(),
  approvedAt: z.iso.datetime().nullable(),
});
export type DraftAdResult = z.output<typeof draftAdResultSchema>;

const geographySchema = z.strictObject({
  cities: z.array(z.string()).optional(),
  countries: z.array(z.string()).optional(),
  regions: z.array(z.string()).optional(),
  states: z.array(z.string()).optional(),
});

const statsSchema = z.strictObject({
  clicks: z.number().optional(),
  conversions: z.number().optional(),
  costPerConversion: z.number().optional(),
  cpc: z.number().optional(),
  cpm: z.number().optional(),
  ctr: z.number().optional(),
  impressions: z.number().optional(),
  purchaseValue: z.number().optional(),
  reach: z.number().optional(),
  roas: z.number().optional(),
  spend: z.number().optional(),
});

const googleSchema = z.strictObject({
  goal: z
    .enum(["traffic", "engagement", "awareness", "conversions"])
    .optional(),
  geography: deliveryGeographySchema.optional(),
  images: z
    .strictObject({ landscape: z.string(), square: z.string() })
    .optional(),
  additionalDescriptions: z.array(z.string()).optional(),
  additionalHeadlines: z.array(z.string()).optional(),
  businessName: z.string().optional(),
  campaignType: z.enum(["search", "display"]).optional(),
  keywords: z.array(z.string()).optional(),
  negativeKeywords: z.array(z.string()).optional(),
});

const linkedinSchema = z.strictObject({
  callToAction: z.string().optional(),
  costType: z.enum(["CPM", "CPC", "CPV"]).optional(),
  organizationId: z.string().optional(),
  unitCost: z.number().optional(),
});

const importSourceSchema = z.strictObject({
  adSets: z.array(z.record(z.string(), jsonValueSchema)),
  campaignId: z.string(),
  importedAt: z.string(),
  issues: z.array(z.string()),
});

const metaSchema = z.strictObject({
  goal: z
    .enum(["traffic", "engagement", "awareness", "video_views", "conversions"])
    .optional(),
  budgetMode: z.enum(["cbo", "abo"]).optional(),
  conversionScope: z.enum(["host", "pixel"]).optional(),
  customConversionId: z.string().optional(),
  customEventType: z.string().optional(),
  importReviewed: z.boolean().optional(),
  importSource: importSourceSchema.optional(),
  pixelId: z.string().optional(),
  placements: z
    .array(
      z.enum([
        "facebook-feed",
        "instagram-feed",
        "facebook-story",
        "instagram-story",
        "facebook-reel",
        "instagram-reel",
        "facebook-marketplace",
        "facebook-right-column",
        "facebook-profile-feed",
        "facebook-notification",
        "instagram-explore",
        "instagram-explore-home",
        "instagram-profile-feed",
        "instagram-profile-reel",
      ]),
    )
    .optional(),
  runUntilPaused: z.boolean().optional(),
  startWhenLaunched: z.boolean().optional(),
});

const settingsSchema = z.strictObject({
  selectedAdIds: z.array(z.string()).optional(),
  previewAdIds: z.array(z.string()).optional(),
  google: googleSchema.optional(),
  linkedin: linkedinSchema.optional(),
  meta: metaSchema.optional(),
});

const addAudienceSchema = z.strictObject({
  brandId: z.string(),
  campaignId: z.string(),
  createdAt: z.iso.datetime(),
  description: z.string().nullable(),

  id: z.string(),

  name: z.string(),

  personaId: z.string().nullable(),
  geography: deliveryGeographySchema.nullable(),
  ageMin: z.number().int().nullable(),
  ageMax: z.number().int().nullable(),

  type: z.enum(audienceTypeEnum.enumValues),
  updatedAt: z.iso.datetime(),
});

export const topAdsOutputSchema = z.strictObject({
  ads: z.array(
    z.strictObject({
      body: z.string(),
      campaign: z.string().nullable(),
      clicks: z.number(),
      conversions: z.number(),
      cpc: z.number(),
      created: z.string().nullable(),
      ctr: z.number(),
      destination: z.enum([
        "unknown",
        "audit",
        "os",
        "list",
        "marketplace",
        "other-link",
        "lead-form",
        "engagement",
      ]),
      engagement: z.number(),
      id: z.string(),
      impressions: z.number(),
      link: z.string().nullable(),
      name: z.string().nullable(),
      objective: z.string(),
      spend: z.number(),
      status: z.string().nullable(),
      thumbnailUrl: z.string().nullable(),
    }),
  ),
  brand: z.strictObject({ id: z.string(), name: z.string(), slug: z.string() }),
  filters: z.strictObject({
    destination: z
      .enum([
        "unknown",
        "audit",
        "os",
        "list",
        "marketplace",
        "other-link",
        "lead-form",
        "engagement",
      ])
      .optional(),
    limit: z.number(),
    metric: z.enum(["engagement", "impressions", "clicks", "ctr", "spend"]),
    objective: z.string().optional(),
    status: z.enum(["all", "active", "non-paused"]),
  }),
  matched: z.number(),
  window: z.strictObject({ fromDate: z.string(), toDate: z.string() }),
});

export const listAdsDestinationsOutputSchema = z.strictObject({
  brand: z.strictObject({
    id: z.string(),
    metaPageId: z.string().nullable(),
    name: z.string(),
    slug: z.string().nullable(),
  }),
  connectionErrors: z.array(
    z.strictObject({ connectionAccountId: z.string(), message: z.string() }),
  ),
  destinations: z.array(
    z.strictObject({
      adAccountId: z.string(),
      adAccountName: z.string().optional(),
      connectionAccountId: z.string(),
      connectionName: z.string().optional(),
      currency: z.string().optional(),
      minimumDailyBudget: z.number().optional(),
      pageId: z.string().nullable(),
      runsAsBrandPage: z.boolean(),
      trackingDefaults: z
        .strictObject({ customEventType: z.string(), pixelId: z.string() })
        .optional(),
    }),
  ),
  platform: z.enum(["meta", "google", "linkedin"]),
});

const campaignHandoffSchema = z.strictObject({
  brandId: z.string(),
  campaignId: z.string(),
  reviewPath: z.string(),
  reviewUrl: z.string().url(),
  state: z.enum(["draft", "pushed", "live"]),
  nextAction: z.string(),
});

export const draftCampaignActionOutputSchema = z.strictObject({
  handoff: campaignHandoffSchema.extend({ state: z.literal("draft") }),
  brandSlug: z.string().nullable(),
  campaign: campaignSchema,
  path: z.string(),
});

export const createSpecializedMetaDraftActionOutputSchema = z.strictObject({
  adAccount: adAccountSchema,
  brand: brandSchema,
  connectionAccountId: z.string(),
  provider: providerSchema,
  requestedStatus: z.literal("PAUSED"),
});

export const boostMetaPostActionOutputSchema = z.strictObject({
  adAccount: adAccountSchema,
  brand: brandSchema,
  connectionAccountId: z.string(),
  launchesActive: z.literal(true),
  provider: providerSchema,
});

export const duplicateCampaignActionOutputSchema = z.strictObject({
  handoff: campaignHandoffSchema.extend({ state: z.literal("draft") }),
  brandSlug: z.string().nullable(),
  campaign: campaignSchema,
  sourceCampaignId: z.string(),
  counts: z.strictObject({
    ads: z.number(),
    audiences: z.number(),
    platforms: z.number(),
  }),
  path: z.string(),
});

export const createAudienceActionOutputSchema = z.strictObject({
  adAccount: adAccountSchema,
  brand: brandSchema,
  planAudienceId: z.string().nullable(),
  platformAudienceId: z.string().nullable(),
  provider: z
    .strictObject({
      audience: z
        .strictObject({
          _id: z.string().optional(),
          approximateCount: z.number().optional(),
          id: z.string().optional(),
          name: z.string().optional(),
          platform: z.string().optional(),
          platformAudienceId: z.string().optional(),
          status: z.string().optional(),
          type: z.string().optional(),
        })
        .catchall(jsonValueSchema)
        .optional(),
    })
    .catchall(jsonValueSchema),
});

export const addAudienceUsersActionOutputSchema = z.strictObject({
  platformAudienceId: z.string(),
  total: z.number(),
  uploaded: z.number(),
});

export const draftAdActionOutputSchema = draftAdSchema;

export const openCampaignActionOutputSchema = z.strictObject({
  assetLinks: z.array(
    z.strictObject({
      id: z.string(),
      audienceId: z.string(),
      platformAudienceId: z.string(),
      platform: z.enum(channelPlatformEnum.enumValues),
    }),
  ),
  handoff: campaignHandoffSchema,
  ads: z.array(
    z.strictObject({
      brandId: z.string(),
      bookingTargetId: z.string().nullable(),
      businessKey: z.string().nullable(),
      campaignId: z.string().nullable(),
      content: z.union([
        contentSchema,
        z.strictObject({
          descriptions: z.array(z.string()),
          headlines: z.array(z.string()),
          linkUrl: z.string().optional(),
        }),
      ]),
      createdAt: z.iso.datetime(),
      home: z
        .strictObject({
          externalId: z.string(),
          id: z.string(),
          name: z.string(),
          url: z.string(),
        })
        .nullable(),
      homeId: z.string().nullable(),
      id: z.string(),
      name: z.string(),
      placements: placementsSchema.nullable(),
      platforms: z.array(z.enum(channelPlatformEnum.enumValues)).nullable(),
      status: z.enum(adStatusEnum.enumValues),
      readyAt: z.iso.datetime().nullable(),
      readyBy: z.string().nullable(),
      approvedAt: z.iso.datetime().nullable(),
      approvedBy: z.string().nullable(),
      replacesAdId: z.string().nullable(),
      type: z.enum(["text", "creative"]),
      updatedAt: z.iso.datetime(),
    }),
  ),
  audiences: z.array(
    z.strictObject({
      brandId: z.string(),
      campaignId: z.string(),
      createdAt: z.iso.datetime(),
      description: z.string().nullable(),

      id: z.string(),

      name: z.string(),

      persona: z.strictObject({ id: z.string(), name: z.string() }).nullable(),
      personaId: z.string().nullable(),
      geography: deliveryGeographySchema.nullable(),
      ageMin: z.number().int().nullable(),
      ageMax: z.number().int().nullable(),

      type: z.enum(audienceTypeEnum.enumValues),
      updatedAt: z.iso.datetime(),
    }),
  ),
  brand: z.strictObject({
    id: z.string(),
    logo: z.string().nullable(),
    name: z.string(),
    organizationId: z.string().nullable(),
    relationship: z.enum(brandRelationshipEnum.enumValues),
    slug: z.string().nullable(),
    website: z.string().nullable(),
  }),
  campaign: campaignSchema,
  personas: z.array(
    z.strictObject({
      ageRanges: z.array(z.string()).nullable(),
      geographies: z.array(z.string()).nullable(),
      id: z.string(),
      name: z.string(),
    }),
  ),
  platformAudiences: z.array(
    z.strictObject({
      audienceId: z.string().nullable(),
      channel: z.strictObject({
        platform: z.enum(channelPlatformEnum.enumValues),
      }),
      externalId: z.string().nullable(),
      id: z.string(),
      name: z.string(),
      personaId: z.string().nullable(),
      source: z.enum([
        "manual",
        "pixel_event",
        "customer_list",
        "amplitude_cohort",
        "lookalike_seed",
      ]),
      sourceId: z.string().nullable(),
      seedMetadata: z
        .object({
          count: z.number(),
          status: z.enum(["uploading", "ready", "failed"]),
        })
        .nullable(),
      sizeLabel: z.string().nullable(),
      type: z.enum(audienceTypeEnum.enumValues),
    }),
  ),
  platformCampaigns: z.array(
    z.strictObject({
      adCount: z.number(),
      ads: z.array(
        z.strictObject({
          adId: z.string().nullable(),
          adSetName: z.string().nullable(),
          bidStrategy: z.string().nullable(),
          body: z.string().nullable(),
          brandId: z.string(),
          businessKey: z.string().nullable(),
          channelId: z.string().nullable(),
          copy: z
            .strictObject({
              descriptions: z.array(z.string()),
              headlines: z.array(z.string()),
            })
            .nullable(),
          createdAt: z.iso.datetime(),
          externalAdSetId: z.string().nullable(),
          externalId: z.string().nullable(),
          headline: z.string().nullable(),
          id: z.string(),
          linkUrl: z.string().nullable(),
          manageUrl: z.string().nullable(),
          media: z.array(mediaItemSchema).nullable(),
          name: z.string().nullable(),
          optimizationGoal: z.string().nullable(),
          platform: z.enum(channelPlatformEnum.enumValues),
          platformDeliveryGroupId: z.string().nullable(),
          platformCampaignId: z.string(),
          platformObjective: z.string().nullable(),
          pushedCreative: pushedCreativeSchema.nullable(),
          stats: statsSchema.nullable(),
          status: z.string().nullable(),
          thumbnailUrl: z.string().nullable(),
          updatedAt: z.iso.datetime(),
        }),
      ),
      deliveryGroups: z.array(
        z.strictObject({
          configuration: deliveryGroupConfigurationSchema.nullable(),
          audienceId: z.string().nullable(),
          brandId: z.string(),
          budget: z.number().nullable(),
          budgetType: z.string().nullable(),
          createdAt: z.iso.datetime(),
          externalId: z.string().nullable(),
          id: z.string(),
          name: z.string(),
          optimizationGoal: z.string().nullable(),
          platformCampaignId: z.string(),
          stats: statsSchema.nullable(),
          status: z.string().nullable(),
          targetingSpec: jsonValueSchema,
          updatedAt: z.iso.datetime(),
        }),
      ),
      brandId: z.string(),
      budget: z.number().nullable(),
      budgetType: z.string().nullable(),
      campaignId: z.string().nullable(),
      performanceCycleId: z.string().nullable(),
      channelId: z.string(),
      createdAt: z.iso.datetime(),
      endAt: z.iso.datetime().nullable(),
      externalId: z.string().nullable(),
      heroThumbnailUrl: z.string().nullable(),
      id: z.string(),
      manageUrl: z.string().nullable(),
      name: z.string(),
      objective: z.string().nullable(),
      platform: z.enum(channelPlatformEnum.enumValues),
      settings: settingsSchema.nullable(),
      spend: z.number().nullable(),
      startAt: z.iso.datetime().nullable(),
      stats: statsSchema.nullable(),
      status: z.enum(platformCampaignStatusEnum.enumValues),
      updatedAt: z.iso.datetime(),
    }),
  ),
});

export const importCreativeActionOutputSchema = z.strictObject({
  asset: z.strictObject({
    id: z.string(),
    title: z.string().nullable(),
    url: z.string().nullable(),
  }),
  deduped: z.boolean(),
  videoPosterOnly: z.boolean(),
});

export const linkAudienceActionOutputSchema = z.strictObject({
  audienceId: z.string().nullable(),
  id: z.string(),
  name: z.string(),
});

export const createReportingConversionActionOutputSchema = z.strictObject({
  customConversionId: z.string(),
  name: z.string(),
  host: z.string(),
  pixelId: z.string(),
  customEventType: z.string(),
  adAccountId: z.string(),
  reused: z.boolean(),
});

export const createGoogleAdsAccountActionOutputSchema = z.strictObject({
  customerId: z.string(),
  name: z.string().nullable(),
  accountCreated: z.boolean(),
  conversionLabel: z.string().nullable(),
});

export const replaceAdCardActionOutputSchema = z.strictObject({
  adId: z.string(),
  cards: z.number(),
  index: z.number(),
  replacedUrl: z.string(),
});

export const addAudienceActionOutputSchema = addAudienceSchema;

export const updateAudienceActionOutputSchema = addAudienceSchema;

export const planPlatformActionOutputSchema = z.strictObject({
  platformCampaignId: z.string(),
});

export const setCreativePoolActionOutputSchema = z.strictObject({
  id: z.string(),
});

export const setPlatformDraftActionOutputSchema = z.strictObject({
  budget: z.number().nullable(),
  budgetType: z.string().nullable(),
  endAt: z.iso.datetime().nullable(),
  id: z.string(),
  platform: z.enum(channelPlatformEnum.enumValues),
  settings: settingsSchema.nullable(),
  startAt: z.iso.datetime().nullable(),
  warnings: z.array(z.string()).optional(),
});

export const attachCampaignActionOutputSchema = z.strictObject({
  adsAdopted: z.number(),
  adsLinked: z.number(),
  audiencesAdopted: z.number(),
  campaignId: z.string().nullable(),
  id: z.string(),
  path: z.string(),
});

export const pullPlatformAudiencesActionOutputSchema = z.strictObject({
  errors: z.array(z.string()),
  mirrored: z.number(),
});

export const deleteCampaignDraftActionOutputSchema = z.strictObject({
  deleted: z.boolean(),
  mediaCleanup: z.strictObject({
    deleted: z.number(),
    kept: z.number(),
    errors: z.array(z.string()),
  }),
});

export const deleteAudienceActionOutputSchema = z.strictObject({
  deleted: z.boolean(),
});

export const deleteAdDraftActionOutputSchema = z.strictObject({
  deleted: z.boolean(),
  /** How many platform ads it was deleted from first. */
  deletedOnPlatform: z.number().optional(),
  mediaCleanup: z.strictObject({
    deleted: z.number(),
    kept: z.number(),
    errors: z.array(z.string()),
  }),
});

export const pushDraftActionOutputSchema = z.union([
  z.strictObject({
    adsCreated: z.number(),
    adSetsCreated: z.number(),
    campaignId: z.string(),
    path: z.string(),
    platform: z.literal("google_ads"),
    platformCampaignRowId: z.string(),
    provider: providerSchema,
    warnings: z.array(z.string()),
  }),
  z.strictObject({
    adsCreated: z.number(),
    adSetsCreated: z.number(),
    campaignId: z.string(),
    path: z.string(),
    platform: z.literal("linkedin_ads"),
    platformCampaignRowId: z.string(),
    warnings: z.array(z.string()),
  }),
  z.strictObject({
    adsCreated: z.number(),
    adSetsCreated: z.number(),
    campaignId: z.string(),
    path: z.string(),
    platform: z.literal("meta_ads"),
    platformCampaignRowId: z.string(),
    warnings: z.array(z.string()),
  }),
]);

export const setDeliveryActionOutputSchema = z.strictObject({
  campaign: z
    .strictObject({
      id: z.string(),
      status: z.enum(platformCampaignStatusEnum.enumValues),
    })
    .optional(),
  provider: z.strictObject({
    message: z.string().optional(),
    skipped: z.number().optional(),
    skippedReasons: z.record(z.string(), jsonValueSchema).optional(),
    status: z.string().optional(),
    updated: z.number().optional(),
  }),
});

export const deletePlatformCampaignActionOutputSchema = z.strictObject({
  deleted: z.boolean(),
  hadExternalId: z.boolean(),
  alreadyGone: z.boolean(),
  provider: z.record(z.string(), jsonValueSchema).nullable(),
});

export const addAdShellActionOutputSchema = z.strictObject({
  adId: z.string(),
  homeName: z.string().nullable(),
  name: z.string(),
});

export const createAdsFromAssetsActionOutputSchema = z.strictObject({
  ads: z.array(
    z.strictObject({
      adId: z.string(),
      homeName: z.string().nullable(),
      name: z.string(),
    }),
  ),
  brandId: z.string(),
});

export const setHomeHeroActionOutputSchema = z.strictObject({
  homeId: z.string(),
  homeName: z.string(),
  photoNumber: z.number().nullable(),
  room: z.string().nullable(),
  heroUrl: z.string(),
});

export const suggestCampaignAudiencesActionOutputSchema = z.strictObject({
  campaignId: z.string(),
  suggestions: z.array(
    z.strictObject({
      name: z.string(),
      personaId: z.string().nullable(),
      why: z.string(),
      geography: deliveryGeographySchema.nullable(),
      ageMin: z.number().int().nullable(),
      ageMax: z.number().int().nullable(),
    }),
  ),
});

const copyBrandVoiceSchema = z.strictObject({
  extractedAt: z.string().optional(),
  fingerprintText: z.string(),
  postsAnalyzed: z.number().optional(),
  voices: z.array(
    z.enum([
      "hero",
      "challenger",
      "sage",
      "innocent",
      "explorer",
      "creator",
      "ruler",
      "caregiver",
      "everyman",
      "jester",
      "lover",
      "magician",
    ]),
  ),
});

const listingExistingCopySchema = z.strictObject({
  listingId: z.string(),
  catalog: z.strictObject({
    headline: z.string().nullable(),
    subtitle: z.string().nullable(),
    pills: z.array(z.string()).nullable(),
    templateId: z.string().nullable(),
  }),
  ads: z.array(
    z.strictObject({
      adId: z.string(),
      campaignId: z.string().nullable(),
      name: z.string(),
      copy: ideaCopySchema.strict(),
      copyOverrides: z.partialRecord(ideaShapeSchema, ideaCopySchema.strict()),
      cards: ideaDocumentSchema.shape.cards,
    }),
  ),
});

export const catalogHomeFactsActionOutputSchema = z.strictObject({
  brand: z.strictObject({
    id: z.string(),
    name: z.string(),
    story: z.string().nullable(),
    voice: copyBrandVoiceSchema.nullable(),
  }),
  homes: z.array(
    z.strictObject({
      homeId: z.string(),
      name: z.string(),
      url: z.string(),
      headline: z.string().nullable(),
      card: catalogCardSchema.strict().nullable(),
      existingCopy: listingExistingCopySchema.nullable(),
      market: marketSchema.strict().nullable(),
      copyRules: z.string(),
      bedrooms: z.number().nullable(),
      bathrooms: z.number().nullable(),
      guests: z.number().nullable(),
      petsAllowed: z.boolean().nullable(),
      amenities: z.array(z.string()),
      description: z.string().nullable(),
      locationDescription: z.string().nullable(),
      photos: z.array(
        z.strictObject({
          number: z.number(),
          room: z.string().nullable(),
        }),
      ),
    }),
  ),
  unknown: z.array(z.string()),
});

export const editCatalogCardActionOutputSchema = z.strictObject({
  approved: z.boolean(),
  homeId: z.string(),
  title: z.string(),
  subtitle: z.string(),
  adHeadline: z.string(),
  adDescription: z.string(),
  templateId: compositionTemplateIdSchema,
  imagePosition: compositionImagePositionSchema,
  showLogo: z.boolean(),
  included: z.boolean(),
});

export const setAdHomeActionOutputSchema = z.strictObject({
  adId: z.string(),
  homeName: z.string().nullable(),
  name: z.string(),
});

export const attachAdSetActionOutputSchema = z.strictObject({
  attached: z.number(),
  campaignId: z.string(),
  campaignName: z.string(),
});

export const setAdStatusActionOutputSchema = z.strictObject({
  adId: z.string(),
  status: z.enum(["approved", "ready", "drawn"]),
});

export const setAdCopyActionOutputSchema = z.strictObject({ adId: z.string() });

export const setPlacementCopyActionOutputSchema = z.strictObject({
  adId: z.string(),
  placementKey: z.string(),
});

export const clearPlacementActionOutputSchema = z.strictObject({
  adId: z.string(),
  placementKey: z.string(),
});

export const freezePlacementActionOutputSchema = z.strictObject({
  adId: z.string(),
  fit: z.strictObject({ issues: z.array(z.string()), ok: z.boolean() }),
  placementKey: z.string(),
});

export const unfreezePlacementActionOutputSchema = z.strictObject({
  adId: z.string(),
  placementKey: z.string(),
});

export const saveIdeaActionOutputSchema = draftAdSchema;

export const ideaHomePhotosActionOutputSchema = z
  .strictObject({
    curated: z.boolean(),
    id: z.string(),
    name: z.string(),
    photos: z.array(
      z.strictObject({
        assetId: z.string().optional(),
        homeId: z.string(),
        label: z.string(),
        url: z.string(),
      }),
    ),
    url: z.string(),
  })
  .nullable();

export const importMetaCampaignActionOutputSchema = z.union([
  z.strictObject({
    campaignId: z.string(),
    path: z.string(),
    reused: z.boolean(),
  }),
  z.strictObject({
    ads: z.number(),
    assets: z.number(),
    campaignId: z.string(),
    issues: z.array(z.string()),
    path: z.string(),
  }),
]);

export const ideaContextActionOutputSchema = z.strictObject({
  ad: z.strictObject({
    approved: z.boolean(),
    document: documentSchema,
    id: z.string(),
    name: z.string(),
    updatedAt: z.string(),
  }),
  brand: z.strictObject({
    id: z.string(),
    name: z.string(),
    story: z.string().nullable(),
    voice: copyBrandVoiceSchema.nullable(),
  }),
  campaignId: z.string().nullable(),
  campaignName: z.string().nullable(),
  /** How the slides are written: the house rules and what each template holds. */
  copyRules: z.string(),
  homes: z.array(
    z.strictObject({
      amenities: z.array(z.string()).optional(),
      bathrooms: z.number().optional(),
      bedrooms: z.number().optional(),
      city: z.string().optional(),
      description: z.string().nullable().optional(),
      guests: z.number().optional(),
      nightlyFrom: z.number().optional(),
      market: marketSchema.strict().nullable(),
      existingCopy: listingExistingCopySchema.nullable(),
      id: z.string(),
      locationDescription: z.string().nullable().optional(),
      name: z.string(),
      petsAllowed: z.boolean().nullable().optional(),
      state: z.string().optional(),
      url: z.string(),
    }),
  ),
  images: z.array(
    z.strictObject({
      cardId: z.string(),
      size: z.string(),
      slide: z.number(),
      kind: z.enum(["image", "video"]),
      source: sourceSchema,
    }),
  ),
  videos: z.array(
    z.strictObject({
      cardId: z.string(),
      size: z.string(),
      slide: z.number(),
      source: z.enum(["storyboard", "poster"]),
      imageUrls: z.array(z.string()),
    }),
  ),
});

export type IdeaContextResult = z.output<typeof ideaContextActionOutputSchema>;
export type EditCatalogCardResult = z.output<
  typeof editCatalogCardActionOutputSchema
>;

/** Native service result; the existing wire contract validates its JSON projection. */
export const draftCampaignActionNativeResultSchema =
  draftCampaignActionOutputSchema.extend({
    campaign: draftCampaignActionOutputSchema.shape.campaign.extend({
      createdAt: z.date(),
      deletedAt: z.date().nullable(),
      endAt: z.date().nullable(),
      startAt: z.date().nullable(),
      updatedAt: z.date(),
    }),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const createSpecializedMetaDraftActionNativeResultSchema =
  createSpecializedMetaDraftActionOutputSchema.extend({
    provider: createSpecializedMetaDraftActionOutputSchema.shape.provider
      .extend({
        ad: createSpecializedMetaDraftActionOutputSchema.shape.provider.shape.ad
          .unwrap()
          .extend({
            creative:
              createSpecializedMetaDraftActionOutputSchema.shape.provider.shape.ad
                .unwrap()
                .shape.creative.unwrap()
                .catchall(z.unknown())
                .optional(),
            metrics:
              createSpecializedMetaDraftActionOutputSchema.shape.provider.shape.ad
                .unwrap()
                .shape.metrics.unwrap()
                .catchall(z.unknown())
                .optional(),
          })
          .catchall(z.unknown())
          .optional(),
        ads: z
          .array(
            createSpecializedMetaDraftActionOutputSchema.shape.provider.shape.ads
              .unwrap()
              .element.extend({
                creative:
                  createSpecializedMetaDraftActionOutputSchema.shape.provider.shape.ads
                    .unwrap()
                    .element.shape.creative.unwrap()
                    .catchall(z.unknown())
                    .optional(),
                metrics:
                  createSpecializedMetaDraftActionOutputSchema.shape.provider.shape.ads
                    .unwrap()
                    .element.shape.metrics.unwrap()
                    .catchall(z.unknown())
                    .optional(),
              })
              .catchall(z.unknown()),
          )
          .optional(),
      })
      .catchall(z.unknown()),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const boostMetaPostActionNativeResultSchema =
  boostMetaPostActionOutputSchema.extend({
    provider: boostMetaPostActionOutputSchema.shape.provider
      .extend({
        ad: boostMetaPostActionOutputSchema.shape.provider.shape.ad
          .unwrap()
          .extend({
            creative: boostMetaPostActionOutputSchema.shape.provider.shape.ad
              .unwrap()
              .shape.creative.unwrap()
              .catchall(z.unknown())
              .optional(),
            metrics: boostMetaPostActionOutputSchema.shape.provider.shape.ad
              .unwrap()
              .shape.metrics.unwrap()
              .catchall(z.unknown())
              .optional(),
          })
          .catchall(z.unknown())
          .optional(),
        ads: z
          .array(
            boostMetaPostActionOutputSchema.shape.provider.shape.ads
              .unwrap()
              .element.extend({
                creative:
                  boostMetaPostActionOutputSchema.shape.provider.shape.ads
                    .unwrap()
                    .element.shape.creative.unwrap()
                    .catchall(z.unknown())
                    .optional(),
                metrics:
                  boostMetaPostActionOutputSchema.shape.provider.shape.ads
                    .unwrap()
                    .element.shape.metrics.unwrap()
                    .catchall(z.unknown())
                    .optional(),
              })
              .catchall(z.unknown()),
          )
          .optional(),
      })
      .catchall(z.unknown()),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const duplicateCampaignActionNativeResultSchema =
  duplicateCampaignActionOutputSchema.extend({
    campaign: draftCampaignActionNativeResultSchema.shape.campaign,
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const createAudienceActionNativeResultSchema =
  createAudienceActionOutputSchema.extend({
    provider: createAudienceActionOutputSchema.shape.provider
      .extend({
        audience: createAudienceActionOutputSchema.shape.provider.shape.audience
          .unwrap()
          .catchall(z.unknown())
          .optional(),
      })
      .catchall(z.unknown()),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const openCampaignActionNativeResultSchema =
  openCampaignActionOutputSchema.extend({
    ads: z.array(
      openCampaignActionOutputSchema.shape.ads.element.extend({
        content: z.union([
          openCampaignActionOutputSchema.shape.ads.element.shape.content.options[0].extend(
            {
              metaImport:
                openCampaignActionOutputSchema.shape.ads.element.shape.content.options[0].shape.metaImport
                  .unwrap()
                  .extend({
                    rawCreative: z.record(
                      openCampaignActionOutputSchema.shape.ads.element.shape.content.options[0].shape.metaImport.unwrap()
                        .shape.rawCreative.keyType,
                      z.unknown(),
                    ),
                  })
                  .optional(),
            },
          ),
          openCampaignActionOutputSchema.shape.ads.element.shape.content
            .options[1],
        ]),
        createdAt: z.date(),
        updatedAt: z.date(),
        readyAt: z.date().nullable(),
        approvedAt: z.date().nullable(),
      }),
    ),
    audiences: z.array(
      openCampaignActionOutputSchema.shape.audiences.element.extend({
        createdAt: z.date(),
        updatedAt: z.date(),
      }),
    ),
    campaign: openCampaignActionOutputSchema.shape.campaign.extend({
      createdAt: z.date(),
      deletedAt: z.date().nullable(),
      endAt: z.date().nullable(),
      startAt: z.date().nullable(),
      updatedAt: z.date(),
    }),
    platformCampaigns: z.array(
      openCampaignActionOutputSchema.shape.platformCampaigns.element.extend({
        ads: z.array(
          openCampaignActionOutputSchema.shape.platformCampaigns.element.shape.ads.element.extend(
            { createdAt: z.date(), updatedAt: z.date() },
          ),
        ),
        deliveryGroups: z.array(
          openCampaignActionOutputSchema.shape.platformCampaigns.element.shape.deliveryGroups.element.extend(
            {
              createdAt: z.date(),
              targetingSpec: z.unknown(),
              updatedAt: z.date(),
            },
          ),
        ),
        createdAt: z.date(),
        endAt: z.date().nullable(),
        settings:
          openCampaignActionOutputSchema.shape.platformCampaigns.element.shape.settings
            .unwrap()
            .extend({
              meta: openCampaignActionOutputSchema.shape.platformCampaigns.element.shape.settings
                .unwrap()
                .shape.meta.unwrap()
                .extend({
                  importSource:
                    openCampaignActionOutputSchema.shape.platformCampaigns.element.shape.settings
                      .unwrap()
                      .shape.meta.unwrap()
                      .shape.importSource.unwrap()
                      .extend({
                        adSets: z.array(
                          z.record(
                            openCampaignActionOutputSchema.shape.platformCampaigns.element.shape.settings
                              .unwrap()
                              .shape.meta.unwrap()
                              .shape.importSource.unwrap().shape.adSets.element
                              .keyType,
                            z.unknown(),
                          ),
                        ),
                      })
                      .optional(),
                })
                .optional(),
            })
            .nullable(),
        startAt: z.date().nullable(),
        updatedAt: z.date(),
      }),
    ),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const addAudienceActionNativeResultSchema =
  addAudienceActionOutputSchema.extend({
    createdAt: z.date(),
    updatedAt: z.date(),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const updateAudienceActionNativeResultSchema =
  addAudienceActionNativeResultSchema;

/** Native service result; the existing wire contract validates its JSON projection. */
export const setPlatformDraftActionNativeResultSchema =
  setPlatformDraftActionOutputSchema.extend({
    endAt: z.date().nullable(),
    settings: setPlatformDraftActionOutputSchema.shape.settings
      .unwrap()
      .extend({
        meta: setPlatformDraftActionOutputSchema.shape.settings
          .unwrap()
          .shape.meta.unwrap()
          .extend({
            importSource: setPlatformDraftActionOutputSchema.shape.settings
              .unwrap()
              .shape.meta.unwrap()
              .shape.importSource.unwrap()
              .extend({
                adSets: z.array(
                  z.record(
                    setPlatformDraftActionOutputSchema.shape.settings
                      .unwrap()
                      .shape.meta.unwrap()
                      .shape.importSource.unwrap().shape.adSets.element.keyType,
                    z.unknown(),
                  ),
                ),
              })
              .optional(),
          })
          .optional(),
      })
      .nullable(),
    startAt: z.date().nullable(),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const pushDraftActionNativeResultSchema = z.union([
  pushDraftActionOutputSchema.options[0].extend({
    provider: pushDraftActionOutputSchema.options[0].shape.provider
      .extend({
        ad: pushDraftActionOutputSchema.options[0].shape.provider.shape.ad
          .unwrap()
          .extend({
            creative:
              pushDraftActionOutputSchema.options[0].shape.provider.shape.ad
                .unwrap()
                .shape.creative.unwrap()
                .catchall(z.unknown())
                .optional(),
            metrics:
              pushDraftActionOutputSchema.options[0].shape.provider.shape.ad
                .unwrap()
                .shape.metrics.unwrap()
                .catchall(z.unknown())
                .optional(),
          })
          .catchall(z.unknown())
          .optional(),
        ads: z
          .array(
            pushDraftActionOutputSchema.options[0].shape.provider.shape.ads
              .unwrap()
              .element.extend({
                creative:
                  pushDraftActionOutputSchema.options[0].shape.provider.shape.ads
                    .unwrap()
                    .element.shape.creative.unwrap()
                    .catchall(z.unknown())
                    .optional(),
                metrics:
                  pushDraftActionOutputSchema.options[0].shape.provider.shape.ads
                    .unwrap()
                    .element.shape.metrics.unwrap()
                    .catchall(z.unknown())
                    .optional(),
              })
              .catchall(z.unknown()),
          )
          .optional(),
      })
      .catchall(z.unknown()),
  }),
  pushDraftActionOutputSchema.options[1],
  pushDraftActionOutputSchema.options[2],
]);

/** Native service result; the existing wire contract validates its JSON projection. */
export const setDeliveryActionNativeResultSchema =
  setDeliveryActionOutputSchema.extend({
    provider: setDeliveryActionOutputSchema.shape.provider.extend({
      skippedReasons: z
        .record(
          setDeliveryActionOutputSchema.shape.provider.shape.skippedReasons.unwrap()
            .keyType,
          z.unknown(),
        )
        .optional(),
    }),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const deletePlatformCampaignActionNativeResultSchema =
  deletePlatformCampaignActionOutputSchema.extend({
    provider: z
      .record(
        deletePlatformCampaignActionOutputSchema.shape.provider.unwrap()
          .keyType,
        z.unknown(),
      )
      .nullable(),
  });
