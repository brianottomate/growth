import { brandPageSnapshotSchema } from "@/lib/brand-website-content";
import {
  productAtlasSchema,
  storefrontContentSchema,
  storefrontReferenceSnapshotSchema,
} from "@/lib/product-atlas";
import { brandRelationshipEnum } from "@/server/db/brand-schema";
import { currencyEnum } from "@/server/db/auth-schema";
import {
  homesSchema,
  brandEmailSenderSchema,
  brandLegalIdentitySchema,
  metaReportingConversionsSchema,
} from "./shared";
import { z } from "zod";

import { brandMarketsSchema } from "@/lib/markets";
import { jsonValueSchema } from "../../kernel/output";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
const managerSchema = z.strictObject({
  email: z.string().nullable(),
  id: z.string(),
  image: z.string().nullable(),
  name: z.string().nullable(),
});

const referenceSchema = z.strictObject({
  kind: z.enum([
    "other",
    "route",
    "screen",
    "component",
    "conversation",
    "tool",
  ]),
  value: z.string(),
});

const atlasSchema = productAtlasSchema;

const adPreviewItemSchema = z.strictObject({
  assetId: z.string(),
  formatId: z.string(),
  homeUrl: z.string().nullable().optional(),
  savedAt: z.string(),
  savedBy: z.string().nullable().optional(),
  templateId: z.string(),
});

const brandFingerprintSchema = z.strictObject({
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

const colorsSchema = z.strictObject({
  accent: z.string().optional(),
  primary: z.string().optional(),
  secondary: z.string().optional(),
});

const fontItemSchema = z.strictObject({
  family: z.string(),
  role: z.enum(["body", "heading"]).optional(),
  weight: z.number().optional(),
});

const animationsSchema = z
  .strictObject({
    easing: z.string().optional(),
    transitionDuration: z.string().optional(),
  })
  .catchall(z.string().optional());

const providerColorsSchema = z
  .strictObject({
    accent: z.string().optional(),
    background: z.string().optional(),
    error: z.string().optional(),
    link: z.string().optional(),
    primary: z.string().optional(),
    secondary: z.string().optional(),
    success: z.string().optional(),
    textPrimary: z.string().optional(),
    textSecondary: z.string().optional(),
    warning: z.string().optional(),
  })
  .catchall(z.string().optional());

const buttonPrimarySchema = z
  .strictObject({
    background: z.string().optional(),
    borderColor: z.string().optional(),
    borderRadius: z.string().optional(),
    textColor: z.string().optional(),
  })
  .catchall(z.string().optional());

const inputSchema = z
  .strictObject({
    borderColor: z.string().optional(),
    borderRadius: z.string().optional(),
    focusBorderColor: z.string().optional(),
  })
  .catchall(z.string().optional());

const componentsSchema = z
  .strictObject({
    buttonPrimary: buttonPrimarySchema.optional(),
    buttonSecondary: buttonPrimarySchema.optional(),
    input: inputSchema.optional(),
  })
  .catchall(jsonValueSchema);

const imagesSchema = z
  .strictObject({
    favicon: z.string().nullable().optional(),
    logo: z.string().nullable().optional(),
    ogImage: z.string().nullable().optional(),
  })
  .catchall(z.string().nullable().optional());

const gridSchema = z
  .strictObject({
    columns: z.number().optional(),
    maxWidth: z.string().optional(),
  })
  .catchall(z.union([z.string(), z.number()]).optional());

const layoutSchema = z
  .strictObject({
    footerHeight: z.string().optional(),
    grid: gridSchema.optional(),
    headerHeight: z.string().optional(),
  })
  .catchall(
    z
      .union([
        z.string(),
        z.number(),
        z.record(z.string(), z.union([z.string(), z.number()]).optional()),
      ])
      .optional(),
  );

const personalitySchema = z.strictObject({
  energy: z.enum(["high", "medium", "low"]),
  targetAudience: z.string(),
  tone: z.enum([
    "bold",
    "professional",
    "playful",
    "modern",
    "traditional",
    "minimalist",
  ]),
});

const spacingSchema = z
  .strictObject({
    baseUnit: z.number().optional(),
    borderRadius: z.string().optional(),
    gridGutter: z.number().optional(),
    margins: z.record(z.string(), z.number()).optional(),
    padding: z.record(z.string(), z.number()).optional(),
  })
  .catchall(
    z
      .union([z.string(), z.number(), z.record(z.string(), z.number())])
      .optional(),
  );

const fontFamiliesSchema = z
  .strictObject({
    code: z.string().optional(),
    heading: z.string().optional(),
    primary: z.string().optional(),
  })
  .catchall(z.string().optional());

const fontSizesSchema = z
  .strictObject({
    body: z.string().optional(),
    h1: z.string().optional(),
    h2: z.string().optional(),
    h3: z.string().optional(),
    small: z.string().optional(),
  })
  .catchall(z.string().optional());

const fontStacksSchema = z
  .strictObject({
    body: z.array(z.string()).optional(),
    heading: z.array(z.string()).optional(),
    paragraph: z.array(z.string()).optional(),
    primary: z.array(z.string()).optional(),
  })
  .catchall(z.array(z.string()).optional());

const fontWeightsSchema = z
  .strictObject({
    bold: z.number().optional(),
    light: z.number().optional(),
    medium: z.number().optional(),
    regular: z.number().optional(),
  })
  .catchall(z.number().optional());

const typographySchema = z.strictObject({
  fontFamilies: fontFamiliesSchema.optional(),
  fontSizes: fontSizesSchema.optional(),
  fontStacks: fontStacksSchema.optional(),
  fontWeights: fontWeightsSchema.optional(),
  lineHeights: z
    .strictObject({
      body: z.number().optional(),
      heading: z.number().optional(),
    })
    .catchall(z.number().optional())
    .optional(),
});

const rawSchema = z
  .strictObject({
    animations: animationsSchema.optional(),
    brandName: z.string().optional(),
    colors: providerColorsSchema.optional(),
    colorScheme: z.enum(["dark", "light"]).optional(),
    components: componentsSchema.optional(),
    fonts: z
      .array(z.strictObject({ family: z.string() }).catchall(jsonValueSchema))
      .optional(),
    icons: z
      .strictObject({
        primaryColor: z.string().optional(),
        style: z.string().optional(),
      })
      .catchall(z.string().optional())
      .optional(),
    images: imagesSchema.optional(),
    layout: layoutSchema.optional(),
    logo: z.string().nullable().optional(),
    personality: personalitySchema.optional(),
    spacing: spacingSchema.optional(),
    tone: z
      .strictObject({
        emojiUsage: z.string().optional(),
        voice: z.string().optional(),
      })
      .catchall(z.string().optional())
      .optional(),
    typography: typographySchema.optional(),
  })
  .catchall(jsonValueSchema);

const brandIdentitySchema = z.strictObject({
  colors: colorsSchema.optional(),
  colorScheme: z.enum(["dark", "light"]).optional(),
  extractedAt: z.string().optional(),
  favicon: z.string().nullable().optional(),
  fonts: z.array(fontItemSchema).optional(),
  logo: z.string().nullable().optional(),
  personality: z
    .strictObject({
      energy: z.string(),
      targetAudience: z.string(),
      tone: z.string(),
    })
    .optional(),
  raw: rawSchema.optional(),
});

const brandListeningStorySchema = z.strictObject({
  productBoilerplate: z.string().optional(),
  replyGuidance: z.string(),
  signalGuidance: z.string(),
  updatedAt: z.string().optional(),
  updatedBy: z.string().optional(),
});

const brandMarkSchema = z.strictObject({
  fontFamily: z.string().nullable().optional(),
  fontWeight: z
    .union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)])
    .nullable()
    .optional(),
  letterSpacing: z.number().nullable().optional(),
  reason: z.string().nullable().optional(),
  iconAssetId: z.string().nullable().optional(),
  iconFrom: z.enum(["logo", "favicon", "logo-icon"]).nullable().optional(),
  source: z.enum(["logo", "favicon", "lockup"]),
  text: z.string().nullable().optional(),
  tuning: z
    .strictObject({
      gapScale: z.number(),
      iconScale: z.number(),
      iconShift: z.number(),
      note: z.string(),
    })
    .nullable()
    .optional(),
  updatedAt: z.string(),
  variants: z.strictObject({
    color: z.string(),
    dark: z.string(),
    white: z.string(),
  }),
  vector: z
    .strictObject({
      color: z.string().nullable().optional(),
      dark: z.string(),
      white: z.string(),
    })
    .nullable()
    .optional(),
});

const industryResearchSchema = z
  .strictObject({
    analyzedAt: z.string().optional(),
    confidence: z.enum(["high", "medium", "low"]).optional(),
    sources: z.array(z.string()).optional(),
  })
  .catchall(jsonValueSchema);

const linkItemSchema = z.strictObject({
  category: z.enum(["sheet", "doc", "dashboard", "design", "other"]).optional(),
  label: z.string(),
  url: z.string().optional(),
});

const performanceChecklistSchema = z.strictObject({
  meta: z
    .record(
      z.string(),
      z.strictObject({
        at: z.string(),
        by: z.string(),
        byName: z.string().nullable(),
      }),
    )
    .optional(),
  values: z
    .record(z.string(), z.union([z.string(), z.number()]).nullable())
    .optional(),
});

const finishedArtworkSchema = z.strictObject({
  assetId: z.string(),
  format: z.enum(["story", "landscape", "square", "portrait", "wide"]),
  url: z.string(),
});

const homeItemSchema = homesSchema;

const homeInventorySchema = z.strictObject({
  addressesFetchedAt: z.string().optional(),
  enrichmentError: z.string().optional(),
  homes: z.array(homeItemSchema),
  syncedAt: z.string(),
});

const performanceSettingsSchema = z.strictObject({
  adCopiesUrl: z.string().nullable().optional(),
  adsConnectionBrandId: z.string().optional(),
  bookings: z.number().nullable().optional(),
  carouselCreativeUrl: z.string().nullable().optional(),
  catalogCreativeUrl: z.string().nullable().optional(),
  creativeDriveUrl: z.string().nullable().optional(),
  dedicatedNewsletter: z.string().nullable().optional(),
  guestListDriveUrl: z.string().nullable().optional(),
  heroCreativeUrl: z.string().nullable().optional(),
  homeInventory: homeInventorySchema.optional(),
  influencer: z.string().nullable().optional(),
  invoiceEmail: z.string().nullable().optional(),
  metaTrackingDefaults: z
    .record(
      z.string(),
      z.strictObject({ customEventType: z.string(), pixelId: z.string() }),
    )
    .optional(),
  metaReportingConversions: metaReportingConversionsSchema,
  reportEmails: z.string().nullable().optional(),
  socialMediaPosts: z.string().nullable().optional(),
  ugcPermission: z.string().nullable().optional(),
  updatedAt: z.string().optional(),
  updatedBy: z.string().nullable().optional(),
  updatedFrom: z.enum(["agent", "intake", "operator"]).optional(),
});

const websiteMetaSchema = z.strictObject({
  description: z.string().optional(),
  favicon: z.string().optional(),
  ogImage: z.string().optional(),
  scrapedAt: z.string().optional(),
  homepage: brandPageSnapshotSchema.optional(),
  about: brandPageSnapshotSchema.optional(),
  title: z.string().optional(),
});

const brandSchema = z.strictObject({
  adPreviews: z.array(adPreviewItemSchema).nullable(),
  brandFingerprint: brandFingerprintSchema.nullable(),
  brandIdentity: brandIdentitySchema.nullable(),
  brandListeningStory: brandListeningStorySchema.nullable(),
  brandMark: brandMarkSchema.nullable(),
  businessStage: z
    .enum([
      "prospect",
      "pitch_sent",
      "meeting_booked",
      "signed",
      "paid",
      "paused",
      "lost",
      "churned",
    ])
    .nullable(),
  businessStageAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
  deliveryStage: z
    .enum([
      "paused",
      "not_started",
      "intake_sent",
      "intake_submitted",
      "access_verified",
      "ads_review",
      "live",
    ])
    .nullable(),
  deliveryStageAt: z.iso.datetime().nullable(),
  description: z.string().nullable(),
  featuredListingUrl: z.string().nullable(),
  story: z.string().nullable(),
  markets: brandMarketsSchema.nullable(),
  followerCount: z.number().nullable(),
  id: z.string(),
  industryResearch: industryResearchSchema.nullable(),
  isActive: z.boolean(),
  lastAccessCheckAt: z.iso.datetime().nullable(),
  leadDomain: z.string().nullable(),
  links: z.array(linkItemSchema).nullable(),
  logo: z.string().nullable(),
  metaPageId: z.string().nullable(),
  name: z.string(),
  organizationId: z.string().nullable(),
  ownerId: z.string().nullable(),
  performanceChecklist: performanceChecklistSchema.nullable(),
  performanceSettings: performanceSettingsSchema.nullable(),
  previewSourceUrl: z.string().nullable(),
  relationship: z.enum(brandRelationshipEnum.enumValues),
  slug: z.string().nullable(),
  tagline: z.string().nullable(),
  type: z.enum(["company", "personal"]),
  updatedAt: z.iso.datetime(),
  wanderOsCheckedAt: z.iso.datetime().nullable(),
  wanderOsWebsiteId: z.string().nullable(),
  wanderOsEnabled: z.boolean(),
  emailSender: brandEmailSenderSchema,
  legalIdentity: brandLegalIdentitySchema,
  website: z.string().nullable(),
  websiteMeta: websiteMetaSchema.nullable(),
  zernioProfileId: z.string().nullable(),
});

const actorSummarySchema = z.strictObject({
  banExpires: z.iso.datetime().nullable(),
  banned: z.boolean().nullable(),
  banReason: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  createdAt: z.iso.datetime(),
  dateFormat: z.enum(["mm_dd_yyyy", "dd_mm_yyyy", "yyyy_mm_dd"]).nullable(),
  displayUsername: z.string().nullable(),
  email: z.string().nullable(),
  emailVerified: z.boolean(),
  id: z.string(),
  image: z.string().nullable(),
  isAnonymous: z.boolean().nullable(),
  name: z.string().nullable(),
  onboardingCompletedAt: z.iso.datetime().nullable(),
  onboardingSource: z.array(z.string()).nullable(),
  preferredCurrency: z.enum(currencyEnum.enumValues).nullable(),
  role: z.string().nullable(),
  timeZone: z.string().nullable(),
  unitSystem: z.enum(["metric", "imperial"]).nullable(),
  updatedAt: z.iso.datetime(),
  username: z.string().nullable(),
});

const changelogItemSchema = z.strictObject({
  action: z.enum([
    "created",
    "content_updated",
    "links_updated",
    "marked_stale",
    "confirmed_up_to_date",
    "manager_changed",
    "content_copied",
  ]),
  actorId: z.string().nullable(),
  actorKind: z.enum(["human", "agent", "seed"]),
  actorName: z.string().nullable(),
  at: z.string(),
  changedPaths: z.array(z.string()),
  note: z.string().optional(),
});

const contentSchema = storefrontContentSchema;

const storefrontItemSchema = z.strictObject({
  changelog: z.array(changelogItemSchema),
  confirmedAt: z.iso.datetime().nullable(),
  confirmedBy: z.string().nullable(),
  content: contentSchema,
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
  externalListingId: z.string().nullable(),
  freshnessStatus: z.enum(["unknown", "stale", "up_to_date"]),
  id: z.string(),
  listingStatus: z.enum([
    "unknown",
    "paused",
    "live",
    "draft",
    "retired",
    "testflight",
    "submitted",
  ]),
  localizedContentUrl: z.string().nullable(),
  managementUrl: z.string().nullable(),
  managerUserId: z.string().nullable(),
  productId: z.string(),
  publicUrl: z.string().nullable(),
  staleMarkedAt: z.iso.datetime().nullable(),
  staleMarkedBy: z.string().nullable(),
  staleNote: z.string().nullable(),
  surface: z.enum([
    "apple_app_store",
    "google_play_store",
    "chrome_web_store",
    "chatgpt_connector",
    "claude_connector",
    "zoom_app_marketplace",
  ]),
  updatedAt: z.iso.datetime(),
});

const productSchema = z.strictObject({
  atlas: atlasSchema,
  brand: brandSchema,
  brandId: z.string(),
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
  description: z.string().nullable(),
  id: z.string(),
  lifecycleStatus: z.enum(["active", "concept", "retired"]),
  managerUserId: z.string().nullable(),
  name: z.string(),
  organizationId: z.string(),
  slug: z.string(),
  updatedAt: z.iso.datetime(),
});

const snapshotSchema = storefrontReferenceSnapshotSchema;

const createProductAtlasProductSchema = z.strictObject({
  atlas: atlasSchema,
  brandId: z.string(),
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
  description: z.string().nullable(),
  id: z.string(),
  lifecycleStatus: z.enum(["active", "concept", "retired"]),
  managerUserId: z.string().nullable(),
  name: z.string(),
  organizationId: z.string(),
  slug: z.string(),
  updatedAt: z.iso.datetime(),
});

export const listProductAtlasProductsOutputSchema = z.strictObject({
  products: z.array(
    z.strictObject({
      atlasCounts: z.strictObject({
        jobs: z.number(),
        journeys: z.number(),
        observations: z.number(),
        stories: z.number(),
        views: z.number(),
      }),
      brand: z.strictObject({
        id: z.string(),
        logo: z.string().nullable(),
        name: z.string(),
      }),
      id: z.string(),
      lifecycleStatus: z.enum(["active", "concept", "retired"]),
      manager: managerSchema.nullable(),
      name: z.string(),
      slug: z.string(),
      storefronts: z.array(
        z.strictObject({
          confirmedAt: z.iso.datetime().nullable(),
          freshnessStatus: z.enum(["unknown", "stale", "up_to_date"]),
          id: z.string(),
          listingStatus: z.enum([
            "unknown",
            "paused",
            "live",
            "draft",
            "retired",
            "testflight",
            "submitted",
          ]),
          staleNote: z.string().nullable(),
          surface: z.enum([
            "apple_app_store",
            "google_play_store",
            "chrome_web_store",
            "chatgpt_connector",
            "claude_connector",
            "zoom_app_marketplace",
          ]),
        }),
      ),
    }),
  ),
});

export const readProductAtlasOutputSchema = z.strictObject({
  atlas: atlasSchema,
  brand: brandSchema,
  brandId: z.string(),
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
  description: z.string().nullable(),
  id: z.string(),
  lifecycleStatus: z.enum(["active", "concept", "retired"]),
  manager: actorSummarySchema.nullable(),
  managerUserId: z.string().nullable(),
  name: z.string(),
  organizationId: z.string(),
  slug: z.string(),
  storefronts: z.array(storefrontItemSchema),
  updatedAt: z.iso.datetime(),
});

export const listProductStorefrontsOutputSchema = z.array(
  z.strictObject({
    changelog: z.array(changelogItemSchema),
    confirmedAt: z.iso.datetime().nullable(),
    confirmedBy: z.string().nullable(),
    confirmer: z
      .strictObject({
        email: z.string().nullable(),
        id: z.string(),
        name: z.string().nullable(),
      })
      .nullable(),
    content: contentSchema,
    createdAt: z.iso.datetime(),
    deletedAt: z.iso.datetime().nullable(),
    externalListingId: z.string().nullable(),
    freshnessStatus: z.enum(["unknown", "stale", "up_to_date"]),
    id: z.string(),
    listingStatus: z.enum([
      "unknown",
      "paused",
      "live",
      "draft",
      "retired",
      "testflight",
      "submitted",
    ]),
    localizedContentUrl: z.string().nullable(),
    managementUrl: z.string().nullable(),
    manager: managerSchema.nullable(),
    managerUserId: z.string().nullable(),
    product: productSchema,
    productId: z.string(),
    publicUrl: z.string().nullable(),
    staleMarkedAt: z.iso.datetime().nullable(),
    staleMarkedBy: z.string().nullable(),
    staleMarker: z
      .strictObject({
        email: z.string().nullable(),
        id: z.string(),
        name: z.string().nullable(),
      })
      .nullable(),
    staleNote: z.string().nullable(),
    surface: z.enum([
      "apple_app_store",
      "google_play_store",
      "chrome_web_store",
      "chatgpt_connector",
      "claude_connector",
      "zoom_app_marketplace",
    ]),
    updatedAt: z.iso.datetime(),
  }),
);

export const readProductStorefrontOutputSchema = z.strictObject({
  changelog: z.array(changelogItemSchema),
  confirmedAt: z.iso.datetime().nullable(),
  confirmedBy: z.string().nullable(),
  confirmer: actorSummarySchema.nullable(),
  content: contentSchema,
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
  externalListingId: z.string().nullable(),
  freshnessStatus: z.enum(["unknown", "stale", "up_to_date"]),
  id: z.string(),
  listingStatus: z.enum([
    "unknown",
    "paused",
    "live",
    "draft",
    "retired",
    "testflight",
    "submitted",
  ]),
  localizedContentUrl: z.string().nullable(),
  managementUrl: z.string().nullable(),
  manager: actorSummarySchema.nullable(),
  managerUserId: z.string().nullable(),
  product: productSchema,
  productId: z.string(),
  publicUrl: z.string().nullable(),
  staleMarkedAt: z.iso.datetime().nullable(),
  staleMarkedBy: z.string().nullable(),
  staleMarker: actorSummarySchema.nullable(),
  staleNote: z.string().nullable(),
  surface: z.enum([
    "apple_app_store",
    "google_play_store",
    "chrome_web_store",
    "chatgpt_connector",
    "claude_connector",
    "zoom_app_marketplace",
  ]),
  updatedAt: z.iso.datetime(),
});

export const listProductStorefrontReferencesOutputSchema = z.array(
  z.strictObject({
    captureMethod: z.enum(["ai_scrape", "structured_import"]),
    createdAt: z.iso.datetime(),
    createdBy: z.string().nullable(),
    creator: z
      .strictObject({
        email: z.string().nullable(),
        id: z.string(),
        name: z.string().nullable(),
      })
      .nullable(),
    id: z.string(),
    model: z.string().nullable(),
    name: z.string(),
    notes: z.string().nullable(),
    observedAt: z.iso.datetime(),
    purpose: z.enum(["competitor", "inspiration"]),
    referenceBrand: z.strictObject({
      id: z.string(),
      logo: z.string().nullable(),
      name: z.string(),
      website: z.string().nullable(),
    }),
    referenceBrandId: z.string(),
    snapshot: snapshotSchema,
    sourceContentHash: z.string().nullable(),
    sourceProvider: z.string().nullable(),
    sourceUrl: z.string(),
    storefrontId: z.string(),
  }),
);

export const createProductAtlasProductOutputSchema =
  createProductAtlasProductSchema;

export const updateProductAtlasOutputSchema = createProductAtlasProductSchema;

export const createProductStorefrontOutputSchema = storefrontItemSchema;

export const updateProductStorefrontOutputSchema = storefrontItemSchema;

export const markProductStorefrontStaleOutputSchema = storefrontItemSchema;

export const confirmProductStorefrontCurrentOutputSchema = storefrontItemSchema;

export const assignProductStorefrontManagerOutputSchema = storefrontItemSchema;

export const copySiblingStorefrontContentOutputSchema = storefrontItemSchema;

export const captureProductStorefrontReferenceOutputSchema = z.strictObject({
  captureMethod: z.enum(["ai_scrape", "structured_import"]),
  createdAt: z.iso.datetime(),
  createdBy: z.string().nullable(),
  id: z.string(),
  model: z.string().nullable(),
  name: z.string(),
  notes: z.string().nullable(),
  observedAt: z.iso.datetime(),
  purpose: z.enum(["competitor", "inspiration"]),
  referenceBrandId: z.string(),
  snapshot: snapshotSchema,
  sourceContentHash: z.string().nullable(),
  sourceProvider: z.string().nullable(),
  sourceUrl: z.string(),
  storefrontId: z.string(),
});

export const removeProductStorefrontReferenceOutputSchema = z.strictObject({
  id: z.string(),
});
