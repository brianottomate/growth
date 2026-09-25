import { compositionTemplateIdSchema } from "@/lib/compositions";
import { campaignStatusEnum } from "@/server/db/ads-schema";
import { audienceTypeEnum } from "@/server/db/ads-schema";
import { platformCampaignStatusEnum } from "@/server/db/ads-schema";
import { brandRelationshipEnum } from "@/server/db/brand-schema";
import { channelPlatformEnum } from "@/server/db/channel-schema";
import { homesSchema, cardsSchema } from "./shared";
import { z } from "zod";
import { jsonValueSchema } from "../../kernel/output";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
const byDestinationItemSchema = z.strictObject({
  ads: z.number(),
  clicks: z.number(),
  ctr: z.number(),
  engagement: z.number(),
  impressions: z.number(),
  key: z.string(),
  spend: z.number(),
});

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
  launchId: z.string().nullable(),
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

const resultItemSchema = z.strictObject({
  node: z.string().optional(),
  reason: z.string().optional(),
  status: z.string().optional(),
});

const providerSchema = z
  .strictObject({
    ad: adSchema.optional(),
    ads: z.array(adSchema).optional(),
    message: z.string().optional(),
    platformAdSetId: z.string().optional(),
    platformCampaignId: z.string().optional(),
    results: z.array(resultItemSchema).optional(),
    validateOnly: z.boolean().optional(),
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
});

const portraitSchema = z.strictObject({
  cta: z.string(),
  eyebrow: z.string(),
  imagePosition: z.enum(["top", "center", "bottom"]),
  showLogo: z.boolean(),
  subtitle: z.string(),
  templateId: z.enum([
    "photo-only",
    "catalog-copy",
    "catalog-place",
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
      linkUrl: z.string(),
    })
    .optional(),
  square: z
    .strictObject({
      body: z.string(),
      callToAction: z.string(),
      headline: z.string(),
      linkUrl: z.string(),
    })
    .optional(),
  story: z
    .strictObject({
      body: z.string(),
      callToAction: z.string(),
      headline: z.string(),
      linkUrl: z.string(),
    })
    .optional(),
  wide: z
    .strictObject({
      body: z.string(),
      callToAction: z.string(),
      headline: z.string(),
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
        "facebook-video-feeds",
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

const draftAdSchema = z.strictObject({
  brandId: z.string(),
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
  homeId: z.string().nullable(),
  id: z.string(),
  name: z.string(),
  placements: placementsSchema.nullable(),
  status: z.enum(["approved", "drawn", "kept"]),
  type: z.enum(["text", "creative"]),
  updatedAt: z.iso.datetime(),
});

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
        "facebook-video-feeds",
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
  google: googleSchema.optional(),
  linkedin: linkedinSchema.optional(),
  meta: metaSchema.optional(),
});

const addAudienceSchema = z.strictObject({
  ageMax: z.number().nullable(),
  ageMin: z.number().nullable(),
  brandId: z.string(),
  campaignId: z.string(),
  createdAt: z.iso.datetime(),
  description: z.string().nullable(),
  geography: geographySchema.nullable(),
  id: z.string(),
  keywords: z.array(z.string()).nullable(),
  name: z.string(),
  optimizationGoal: z.string().nullable(),
  personaId: z.string().nullable(),
  type: z.enum(audienceTypeEnum.enumValues),
  updatedAt: z.iso.datetime(),
});

export const adsScopeOutputSchema = z.strictObject({
  account: z.strictObject({
    id: z.string().optional(),
    name: z.string().optional(),
  }),
  brand: z.strictObject({ id: z.string(), name: z.string(), slug: z.string() }),
  byDestination: z.array(byDestinationItemSchema),
  byMonth: z.array(
    z.strictObject({
      ads: z.number(),
      clicks: z.number(),
      impressions: z.number(),
      month: z.string(),
      spend: z.number(),
    }),
  ),
  byObjective: z.array(byDestinationItemSchema),
  flags: z.strictObject({ hasAuditAds: z.boolean(), hasOsAds: z.boolean() }),
  totals: z.strictObject({
    ads: z.number(),
    allAds: z.number(),
    clicks: z.number(),
    conversions: z.number(),
    ctr: z.number(),
    engagement: z.number(),
    impressions: z.number(),
    spend: z.number(),
  }),
  window: z.strictObject({ fromDate: z.string(), toDate: z.string() }),
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
  validateOnly: z.boolean(),
});

export const boostMetaPostActionOutputSchema = z.strictObject({
  adAccount: adAccountSchema,
  brand: brandSchema,
  connectionAccountId: z.string(),
  launchesActive: z.literal(true),
  provider: providerSchema,
});

export const duplicateMetaCampaignActionOutputSchema = z.strictObject({
  brand: z.strictObject({
    id: z.string(),
    metaPageId: z.string().nullable(),
    name: z.string(),
    organizationId: z.string().nullable(),
    performanceSettings: z
      .strictObject({
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
            z.strictObject({
              customEventType: z.string(),
              pixelId: z.string(),
            }),
          )
          .optional(),
        reportEmails: z.string().nullable().optional(),
        socialMediaPosts: z.string().nullable().optional(),
        ugcPermission: z.string().nullable().optional(),
        updatedAt: z.string().optional(),
        updatedBy: z.string().nullable().optional(),
        updatedFrom: z.enum(["agent", "intake", "operator"]).optional(),
      })
      .nullable(),
    slug: z.string().nullable(),
    zernioProfileId: z.string().nullable(),
  }),
  provider: z
    .strictObject({
      copiedCampaignId: z.string().optional(),
      discovery: jsonValueSchema.optional(),
      raw: jsonValueSchema.optional(),
    })
    .catchall(jsonValueSchema),
  requestedStatus: z.literal("PAUSED"),
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
  handoff: campaignHandoffSchema,
  ads: z.array(
    z.strictObject({
      brandId: z.string(),
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
      status: z.enum(["approved", "drawn", "kept"]),
      type: z.enum(["text", "creative"]),
      updatedAt: z.iso.datetime(),
    }),
  ),
  audiences: z.array(
    z.strictObject({
      ageMax: z.number().nullable(),
      ageMin: z.number().nullable(),
      brandId: z.string(),
      campaignId: z.string(),
      createdAt: z.iso.datetime(),
      description: z.string().nullable(),
      geography: geographySchema.nullable(),
      id: z.string(),
      keywords: z.array(z.string()).nullable(),
      name: z.string(),
      optimizationGoal: z.string().nullable(),
      persona: z.strictObject({ id: z.string(), name: z.string() }).nullable(),
      personaId: z.string().nullable(),
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
      id: z.string(),
      name: z.string(),
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
          createdAt: z.iso.datetime(),
          externalAdSetId: z.string().nullable(),
          externalId: z.string().nullable(),
          headline: z.string().nullable(),
          id: z.string(),
          linkUrl: z.string().nullable(),
          manageUrl: z.string().nullable(),
          media: z.array(creativePoolItemSchema).nullable(),
          name: z.string().nullable(),
          optimizationGoal: z.string().nullable(),
          platform: z.enum(channelPlatformEnum.enumValues),
          platformAdSetId: z.string().nullable(),
          platformCampaignId: z.string(),
          platformObjective: z.string().nullable(),
          stats: statsSchema.nullable(),
          status: z.string().nullable(),
          thumbnailUrl: z.string().nullable(),
          updatedAt: z.iso.datetime(),
        }),
      ),
      adSets: z.array(
        z.strictObject({
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

export const previewAdActionOutputSchema = z.strictObject({
  adId: z.string(),
  adName: z.string(),
  formats: z.array(z.string()),
  previews: z.array(
    z.strictObject({ iframe: z.string(), src: z.string().nullable() }),
  ),
  previewUrls: z.array(z.string()),
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

export const listCampaignsActionOutputSchema = z.array(
  z.strictObject({
    id: z.string(),
    name: z.string(),
    status: z.enum(campaignStatusEnum.enumValues),
  }),
);

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
});

export const deleteAudienceActionOutputSchema = z.strictObject({
  deleted: z.boolean(),
});

export const deleteAdDraftActionOutputSchema = z.strictObject({
  deleted: z.boolean(),
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
    validateOnly: z.boolean(),
    warnings: z.array(z.string()),
  }),
  z.strictObject({
    adsCreated: z.number(),
    adSetsCreated: z.number(),
    campaignId: z.string(),
    path: z.string(),
    platform: z.literal("linkedin_ads"),
    platformCampaignRowId: z.string(),
    validateOnly: z.boolean(),
    warnings: z.array(z.string()),
  }),
  z.strictObject({
    adsCreated: z.number(),
    campaignId: z.string(),
    platform: z.literal("meta_ads"),
    provider: providerSchema,
    validateOnly: z.boolean(),
    warnings: z.array(z.string()),
  }),
  z.strictObject({
    adsCreated: z.number(),
    adSetsCreated: z.number(),
    campaignId: z.string(),
    path: z.string(),
    platform: z.literal("meta_ads"),
    platformCampaignRowId: z.string(),
    validateOnly: z.boolean(),
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
  provider: z.record(z.string(), jsonValueSchema).nullable(),
});

export const buildAdSetActionOutputSchema = z.strictObject({
  ads: z.array(
    z.strictObject({
      cards: z.number(),
      homeName: z.string().nullable(),
      id: z.string(),
      kind: z.enum([
        "carousel",
        "static",
        "catalog",
        "hero_carousel",
        "catalog_home",
        "all_properties_carousel",
      ]),
      name: z.string(),
    }),
  ),
  brandId: z.string(),
  homes: z.array(
    z.strictObject({ id: z.string(), name: z.string(), url: z.string() }),
  ),
  note: z.string().nullable(),
  ok: z.literal(true),
  replaced: z.number(),
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

export const catalogHomeFactsActionOutputSchema = z.strictObject({
  homes: z.array(
    z.strictObject({
      homeId: z.string(),
      name: z.string(),
      url: z.string(),
      headline: z.string().nullable(),
      bedrooms: z.number().nullable(),
      bathrooms: z.number().nullable(),
      guests: z.number().nullable(),
      petsAllowed: z.boolean().nullable(),
      amenities: z.array(z.string()),
      description: z.string().nullable(),
      locationDescription: z.string().nullable(),
    }),
  ),
  unknown: z.array(z.string()),
});

export const editCatalogCardActionOutputSchema = z.strictObject({
  approved: z.boolean(),
  homeId: z.string(),
  title: z.string(),
  subtitle: z.string(),
  templateId: compositionTemplateIdSchema,
  imagePosition: z.enum(["top", "center", "bottom"]),
  showLogo: z.boolean(),
  included: z.boolean(),
});

export const setAdHomeActionOutputSchema = z.strictObject({
  adId: z.string(),
  homeName: z.string().nullable(),
  name: z.string(),
});

export const editAdCardsActionOutputSchema = z.strictObject({
  adId: z.string(),
  cards: z.number(),
  story: storySchema.nullable(),
});

export const attachAdSetActionOutputSchema = z.strictObject({
  attached: z.number(),
  campaignId: z.string(),
  campaignName: z.string(),
});

export const setAdStatusActionOutputSchema = z.strictObject({
  adId: z.string(),
  status: z.enum(["approved", "drawn"]),
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
    voice: z
      .strictObject({
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
      })
      .nullable()
      .optional(),
  }),
  campaignId: z.string(),
  campaignName: z.string(),
  homes: z.array(
    z.strictObject({
      amenities: z.array(z.string()).optional(),
      bathrooms: z.number().optional(),
      bedrooms: z.number().optional(),
      city: z.string().optional(),
      description: z.string().nullable().optional(),
      guests: z.number().optional(),
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
      source: sourceSchema,
    }),
  ),
});
