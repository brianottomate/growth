import { performanceSettingsSchema } from "./brands";
import { brandPageSnapshotSchema } from "@/lib/brand-website-content";
import {
  brandEmailDeliverySchema,
  brandEmailSenderSchema,
  brandLegalIdentitySchema,
} from "./shared";
import { performanceCycleStatusEnum } from "@/server/db/performance-schema";
import { performanceAccountStatusEnum } from "@/server/db/performance-schema";
import { campaignStatusEnum } from "@/server/db/ads-schema";
import { lifecycleRunStateEnum } from "@/server/db/lifecycle-schema";
import { channelPlatformEnum } from "@/server/db/channel-schema";
import { platformCampaignStatusEnum } from "@/server/db/ads-schema";
import { brandRelationshipEnum } from "@/server/db/brand-schema";
import { z } from "zod";

import { brandMarketsSchema } from "@/lib/markets";
import { jsonValueSchema } from "../../kernel/output";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
const cycleItemSchema = z.strictObject({
  accountId: z.string(),
  actualSpendAt: z.iso.datetime().nullable(),
  actualSpendCents: z.number().nullable(),
  billedAmount: z.number().nullable(),
  createdAt: z.iso.datetime(),
  endAt: z.iso.datetime().nullable(),
  feePaidAt: z.iso.datetime().nullable(),
  id: z.string(),
  mediaBudget: z.number().nullable(),
  mediaPaidAt: z.iso.datetime().nullable(),
  notes: z.string().nullable(),
  period: z.string(),
  startAt: z.iso.datetime().nullable(),
  status: z.enum(performanceCycleStatusEnum.enumValues),
  updatedAt: z.iso.datetime(),
});

const propertyItemSchema = z.strictObject({
  accountId: z.string(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
  id: z.string(),
  notes: z.string().nullable(),
  propertyId: z.string().nullable(),
  siteUrl: z.string().nullable(),
  state: z.string().nullable(),
  title: z.string().nullable(),
  updatedAt: z.iso.datetime(),
  wanderUrl: z.string().nullable(),
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

const answersSchema = z
  .strictObject({
    accountsConnected: z.boolean().optional(),
    allProperties: z.boolean().optional(),
    anythingElse: z.string().optional(),
    billingAcknowledged: z.boolean().optional(),
    budget: z.string().optional(),
    creativeDriveUrl: z.string().optional(),
    detailsConfirmed: z.boolean().optional(),
    guestListDriveUrl: z.string().optional(),
    invoiceEmail: z.string().optional(),
    propertyNotes: z.string().optional(),
    propertyUrls: z.array(z.string()).optional(),
    reportEmails: z.string().optional(),
    ugcPermission: z.string().optional(),
  })
  .catchall(jsonValueSchema);

const accountSchema = z.strictObject({
  brandId: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
  id: z.string(),
  name: z.string(),
  notes: z.string().nullable(),
  organizationId: z.string(),
  plan: z.string().nullable(),
  signedAt: z.iso.datetime().nullable(),
  status: z.enum(performanceAccountStatusEnum.enumValues),
  updatedAt: z.iso.datetime(),
  website: z.string().nullable(),
});

const createPerformanceAccountSchema = z.strictObject({
  account: accountSchema,
});

const addPerformancePropertySchema = z.strictObject({
  property: propertyItemSchema,
});

const openPerformanceCycleSchema = z.strictObject({ cycle: cycleItemSchema });

export const listPerformanceAccountsActionOutputSchema = z.strictObject({
  accounts: z.array(
    z.strictObject({
      brandId: z.string().nullable(),
      contactEmail: z.string().nullable(),
      contactName: z.string().nullable(),
      createdAt: z.iso.datetime(),
      currentCycle: z
        .strictObject({
          actualSpendAt: z.iso.datetime().nullable(),
          actualSpendCents: z.number().nullable(),
          billedAmount: z.number().nullable(),
          delivery: z.strictObject({
            ads: z.number(),
            emails: z.number(),
            influencers: z.number(),
          }),
          hasReport: z.boolean(),
          id: z.string(),
          mediaBudget: z.number().nullable(),
          period: z.string(),
          status: z.enum(performanceCycleStatusEnum.enumValues),
        })
        .nullable(),
      cycles: z.array(
        z.strictObject({
          actualSpendAt: z.iso.datetime().nullable(),
          actualSpendCents: z.number().nullable(),
          billedAmount: z.number().nullable(),
          id: z.string(),
          mediaBudget: z.number().nullable(),
          period: z.string(),
          status: z.enum(performanceCycleStatusEnum.enumValues),
        }),
      ),
      deletedAt: z.iso.datetime().nullable(),
      id: z.string(),
      lifetimeBilled: z.number(),
      name: z.string(),
      notes: z.string().nullable(),
      organizationId: z.string(),
      plan: z.string().nullable(),
      properties: z.array(
        z.strictObject({
          id: z.string(),
          propertyId: z.string().nullable(),
          title: z.string().nullable(),
          wanderUrl: z.string().nullable(),
        }),
      ),
      reports: z.array(
        z.strictObject({
          cycleId: z.string(),
          id: z.string(),
          status: z.enum(["draft", "published"]),
        }),
      ),
      signedAt: z.iso.datetime().nullable(),
      status: z.enum(performanceAccountStatusEnum.enumValues),
      updatedAt: z.iso.datetime(),
      website: z.string().nullable(),
    }),
  ),
});

export const getPerformanceAccountActionOutputSchema = z.strictObject({
  account: z.strictObject({
    brand: z
      .strictObject({
        id: z.string(),
        name: z.string(),
        slug: z.string().nullable(),
        website: z.string().nullable(),
      })
      .nullable(),
    brandId: z.string().nullable(),
    contactEmail: z.string().nullable(),
    contactName: z.string().nullable(),
    createdAt: z.iso.datetime(),
    cycles: z.array(cycleItemSchema),
    deletedAt: z.iso.datetime().nullable(),
    id: z.string(),
    name: z.string(),
    notes: z.string().nullable(),
    organizationId: z.string(),
    plan: z.string().nullable(),
    properties: z.array(propertyItemSchema),
    reports: z.array(
      z.strictObject({
        cycleId: z.string(),
        id: z.string(),
        periodLabel: z.string(),
        publishedAt: z.iso.datetime().nullable(),
        status: z.enum(["draft", "published"]),
      }),
    ),
    signedAt: z.iso.datetime().nullable(),
    status: z.enum(performanceAccountStatusEnum.enumValues),
    updatedAt: z.iso.datetime(),
    website: z.string().nullable(),
  }),
  delivery: z.strictObject({
    ads: z.array(
      z.strictObject({
        adSetName: z.string().nullable(),
        businessKey: z.string().nullable(),
        externalId: z.string().nullable(),
        id: z.string(),
        media: z
          .array(
            z.strictObject({
              assetId: z.string().optional(),
              derivedFrom: z.string().optional(),
              height: z.number().optional(),
              thumbnail: z.string().optional(),
              type: z.enum(["image", "video", "carousel"]),
              url: z.string(),
              width: z.number().optional(),
            }),
          )
          .nullable(),
        name: z.string().nullable(),
        platformCampaignId: z.string(),
        stats: statsSchema.nullable(),
        status: z.string().nullable(),
        thumbnailUrl: z.string().nullable(),
      }),
    ),
    amplificationTargets: z.array(
      z.strictObject({
        actionKind: z.string(),
        ask: z.string(),
        id: z.string(),
        performanceCycleId: z.string().nullable(),
      }),
    ),
    campaigns: z.array(
      z.strictObject({
        budget: z.number().nullable(),
        id: z.string(),
        name: z.string(),
        performanceCycleId: z.string().nullable(),
        status: z.enum(campaignStatusEnum.enumValues),
      }),
    ),
    lifecycleCampaigns: z.array(
      z.strictObject({
        id: z.string(),
        name: z.string(),
        performanceCycleId: z.string().nullable(),
        runState: z.enum(lifecycleRunStateEnum.enumValues),
      }),
    ),
    platformCampaigns: z.array(
      z.strictObject({
        campaignId: z.string().nullable(),
        heroThumbnailUrl: z.string().nullable(),
        id: z.string(),
        manageUrl: z.string().nullable(),
        name: z.string(),
        platform: z.enum(channelPlatformEnum.enumValues),
        spend: z.number().nullable(),
        stats: statsSchema.nullable(),
        status: z.enum(platformCampaignStatusEnum.enumValues),
      }),
    ),
  }),
});

export const listIntakesActionOutputSchema = z.array(
  z.strictObject({
    accessClaimedAt: z.iso.datetime().nullable(),
    accountId: z.string(),
    answers: answersSchema,
    answersFingerprint: z.string().nullable(),
    appliedAt: z.iso.datetime().nullable(),
    appliedBy: z.string().nullable(),
    appliedSummary: z.array(z.string()).nullable(),
    billingAcknowledgedAt: z.iso.datetime().nullable(),
    brandId: z.string().nullable(),
    brandSlug: z.string().nullable(),
    budgetIsRecommendation: z.boolean(),
    createdAt: z.iso.datetime(),
    guestListConsentAt: z.iso.datetime().nullable(),
    id: z.string(),
    instagramLinkConfirmedAt: z.iso.datetime().nullable(),
    mediaBudgetDollars: z.number().nullable(),
    status: z.enum(["verified", "submitted", "applied"]),
    submittedAt: z.iso.datetime(),
    submittedByEmail: z.string().nullable(),
    submittedByName: z.string().nullable(),
    updatedAt: z.iso.datetime(),
    verifiedAdAccountId: z.string().nullable(),
    verifiedPageId: z.string().nullable(),
    verifiedPixelId: z.string().nullable(),
    zernioVerifiedAt: z.iso.datetime().nullable(),
  }),
);

export const previewIntakeApplyActionOutputSchema = z.strictObject({
  blockers: z.array(z.string()),
  currentMediaBudget: z.number().nullable(),
  cycleId: z.string().nullable(),
  intake: z.strictObject({
    accessClaimedAt: z.iso.datetime().nullable(),
    account: accountSchema,
    accountId: z.string(),
    answers: answersSchema,
    answersFingerprint: z.string().nullable(),
    appliedAt: z.iso.datetime().nullable(),
    appliedBy: z.string().nullable(),
    appliedSummary: z.array(z.string()).nullable(),
    billingAcknowledgedAt: z.iso.datetime().nullable(),
    brand: z
      .strictObject({
        adPreviews: z
          .array(
            z.strictObject({
              assetId: z.string(),
              formatId: z.string(),
              homeUrl: z.string().nullable().optional(),
              savedAt: z.string(),
              savedBy: z.string().nullable().optional(),
              templateId: z.string(),
            }),
          )
          .nullable(),
        brandFingerprint: z
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
          .nullable(),
        brandIdentity: z
          .strictObject({
            colors: z
              .strictObject({
                accent: z.string().optional(),
                primary: z.string().optional(),
                secondary: z.string().optional(),
              })
              .optional(),
            colorScheme: z.enum(["dark", "light"]).optional(),
            extractedAt: z.string().optional(),
            favicon: z.string().nullable().optional(),
            fonts: z
              .array(
                z.strictObject({
                  family: z.string(),
                  role: z.enum(["body", "heading"]).optional(),
                  weight: z.number().optional(),
                }),
              )
              .optional(),
            logo: z.string().nullable().optional(),
            personality: z
              .strictObject({
                energy: z.string(),
                targetAudience: z.string(),
                tone: z.string(),
              })
              .optional(),
            raw: jsonValueSchema.optional(),
          })
          .nullable(),
        brandListeningStory: z
          .strictObject({
            productBoilerplate: z.string().optional(),
            replyGuidance: z.string(),
            signalGuidance: z.string(),
            updatedAt: z.string().optional(),
            updatedBy: z.string().optional(),
          })
          .nullable(),
        brandMark: z
          .strictObject({
            fontFamily: z.string().nullable().optional(),
            fontWeight: z
              .union([
                z.literal(400),
                z.literal(500),
                z.literal(600),
                z.literal(700),
              ])
              .nullable()
              .optional(),
            letterSpacing: z.number().nullable().optional(),
            reason: z.string().nullable().optional(),
            iconAssetId: z.string().nullable().optional(),
            iconFrom: z
              .enum(["logo", "favicon", "logo-icon"])
              .nullable()
              .optional(),
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
          })
          .nullable(),
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
        industryResearch: z
          .strictObject({
            analyzedAt: z.string().optional(),
            confidence: z.enum(["high", "medium", "low"]).optional(),
            sources: z.array(z.string()).optional(),
          })
          .catchall(jsonValueSchema)
          .nullable(),
        isActive: z.boolean(),
        lastAccessCheckAt: z.iso.datetime().nullable(),
        leadDomain: z.string().nullable(),
        links: z
          .array(
            z.strictObject({
              category: z
                .enum(["sheet", "doc", "dashboard", "design", "other"])
                .optional(),
              label: z.string(),
              url: z.string().optional(),
            }),
          )
          .nullable(),
        logo: z.string().nullable(),
        metaPageId: z.string().nullable(),
        name: z.string(),
        organizationId: z.string().nullable(),
        ownerId: z.string().nullable(),
        performanceChecklist: z
          .strictObject({
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
          })
          .nullable(),
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
        emailDelivery: brandEmailDeliverySchema,
        website: z.string().nullable(),
        websiteMeta: z
          .strictObject({
            description: z.string().optional(),
            favicon: z.string().optional(),
            ogImage: z.string().optional(),
            scrapedAt: z.string().optional(),
            homepage: brandPageSnapshotSchema.optional(),
            about: brandPageSnapshotSchema.optional(),
            title: z.string().optional(),
          })
          .nullable(),
        zernioProfileId: z.string().nullable(),
      })
      .nullable(),
    brandId: z.string().nullable(),
    brandSlug: z.string().nullable(),
    budgetIsRecommendation: z.boolean(),
    createdAt: z.iso.datetime(),
    guestListConsentAt: z.iso.datetime().nullable(),
    id: z.string(),
    instagramLinkConfirmedAt: z.iso.datetime().nullable(),
    mediaBudgetDollars: z.number().nullable(),
    status: z.enum(["verified", "submitted", "applied"]),
    submittedAt: z.iso.datetime(),
    submittedByEmail: z.string().nullable(),
    submittedByName: z.string().nullable(),
    updatedAt: z.iso.datetime(),
    verifiedAdAccountId: z.string().nullable(),
    verifiedPageId: z.string().nullable(),
    verifiedPixelId: z.string().nullable(),
    zernioVerifiedAt: z.iso.datetime().nullable(),
  }),
  mediaBudgetDollars: z.number().nullable(),
  needsBudgetDecision: z.boolean(),
  featuredHomes: z.array(
    z.strictObject({ id: z.string(), name: z.string(), url: z.string() }),
  ),
  newProperties: z.array(
    z.strictObject({
      accountId: z.string(),
      siteUrl: z.string(),
      title: z.string().nullable(),
    }),
  ),
  period: z.string(),
  willCreateCycle: z.boolean(),
});

export const verifyIntakeAccessActionOutputSchema = z.strictObject({
  brandName: z.string(),
  candidates: z.array(
    z.strictObject({ id: z.string(), name: z.string().nullable() }),
  ),
  errors: z.array(z.string()),
  matched: z
    .strictObject({ id: z.string(), name: z.string().nullable() })
    .nullable(),
});

export const createPerformanceAccountActionOutputSchema =
  createPerformanceAccountSchema;

export const updatePerformanceAccountActionOutputSchema =
  createPerformanceAccountSchema;

export const addPerformancePropertyActionOutputSchema =
  addPerformancePropertySchema;

export const updatePerformancePropertyActionOutputSchema =
  addPerformancePropertySchema;

export const openPerformanceCycleActionOutputSchema =
  openPerformanceCycleSchema;

export const updatePerformanceCycleActionOutputSchema =
  openPerformanceCycleSchema;

export const searchAttachableCampaignsActionOutputSchema = z.strictObject({
  campaigns: z.array(
    z.strictObject({
      campaignCycleId: z.string().nullable(),
      campaignId: z.string().nullable(),
      externalId: z.string().nullable(),
      heroThumbnailUrl: z.string().nullable(),
      id: z.string(),
      name: z.string(),
      platform: z.enum(channelPlatformEnum.enumValues),
      spend: z.number().nullable(),
      startAt: z.iso.datetime().nullable(),
      stats: statsSchema.nullable(),
      status: z.enum(platformCampaignStatusEnum.enumValues),
    }),
  ),
});

export const refreshPerformanceCycleSpendActionOutputSchema = z.strictObject({
  actualSpendCents: z.number(),
  campaigns: z.number(),
  cycleId: z.string(),
});

export const listSponsoredAbandonmentActionOutputSchema = z.strictObject({
  events: z.array(
    z.strictObject({
      abandonedAt: z.iso.datetime().nullable(),
      account: z
        .strictObject({
          contactName: z.string().nullable(),
          id: z.string(),
          name: z.string(),
        })
        .nullable(),
      checkin: z.string().nullable(),
      checkout: z.string().nullable(),
      email: z.string().nullable(),
      heat: z.string(),
      property: z
        .strictObject({
          title: z.string().nullable(),
          wanderUrl: z.string().nullable(),
        })
        .nullable(),
      propertyName: z.string().nullable(),
      userId: z.string(),
      value: z.number().nullable(),
    }),
  ),
  matchedProperties: z.number(),
  unresolvedProperties: z.array(
    z.strictObject({
      accountId: z.string(),
      accountName: z.string(),
      contactName: z.string().nullable(),
      propertyId: z.string().nullable(),
      propertyRowId: z.string(),
      title: z.string().nullable(),
      wanderUrl: z.string().nullable(),
    }),
  ),
});

export const syncAdCampaignsActionOutputSchema = z.strictObject({
  adSetsWritten: z.number(),
  adsWritten: z.number(),
  appliedFilters: z.strictObject({
    limit: z.number().nullable(),
    minSpend: z.number().nullable(),
    sinceDays: z.number().nullable(),
    statuses: z.array(z.string()).nullable(),
  }),
  brandId: z.string(),
  byObjective: z.record(z.string(), z.number()),
  candidates: z.number(),
  channelId: z.string(),
  cyclesRepriced: z.number(),
  errors: z.array(z.string()),
  filteredOut: z.number(),
  inserted: z.number(),
  reconciled: z.number(),
  skipped: z.number(),
  updated: z.number(),
});

export const attachToPerformanceCycleActionOutputSchema = z.union([
  z.strictObject({
    detachedFromWrapper: z.boolean(),
    id: z.string(),
    kind: z.literal("platformCampaign"),
    performanceCycleId: z.null(),
  }),
  z.strictObject({
    actualSpendCents: z.number(),
    campaignId: z.string(),
    createdWrapper: z.boolean(),
    id: z.string(),
    kind: z.literal("platformCampaign"),
    performanceCycleId: z.string(),
  }),
  z.strictObject({
    id: z.string(),
    kind: z.enum(["campaign", "lifecycleCampaign", "amplificationTarget"]),
    performanceCycleId: z.string().nullable(),
    previousCycleId: z.string().nullable(),
  }),
]);

/** Native service result; the existing wire contract validates its JSON projection. */
export const listPerformanceAccountsActionNativeResultSchema =
  listPerformanceAccountsActionOutputSchema.extend({
    accounts: z.array(
      listPerformanceAccountsActionOutputSchema.shape.accounts.element.extend({
        createdAt: z.date(),
        currentCycle:
          listPerformanceAccountsActionOutputSchema.shape.accounts.element.shape.currentCycle
            .unwrap()
            .extend({ actualSpendAt: z.date().nullable() })
            .nullable(),
        cycles: z.array(
          listPerformanceAccountsActionOutputSchema.shape.accounts.element.shape.cycles.element.extend(
            { actualSpendAt: z.date().nullable() },
          ),
        ),
        deletedAt: z.date().nullable(),
        signedAt: z.date().nullable(),
        updatedAt: z.date(),
      }),
    ),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const getPerformanceAccountActionNativeResultSchema =
  getPerformanceAccountActionOutputSchema.extend({
    account: getPerformanceAccountActionOutputSchema.shape.account.extend({
      createdAt: z.date(),
      cycles: z.array(
        getPerformanceAccountActionOutputSchema.shape.account.shape.cycles.element.extend(
          {
            actualSpendAt: z.date().nullable(),
            createdAt: z.date(),
            endAt: z.date().nullable(),
            feePaidAt: z.date().nullable(),
            mediaPaidAt: z.date().nullable(),
            startAt: z.date().nullable(),
            updatedAt: z.date(),
          },
        ),
      ),
      deletedAt: z.date().nullable(),
      properties: z.array(
        getPerformanceAccountActionOutputSchema.shape.account.shape.properties.element.extend(
          {
            createdAt: z.date(),
            deletedAt: z.date().nullable(),
            updatedAt: z.date(),
          },
        ),
      ),
      reports: z.array(
        getPerformanceAccountActionOutputSchema.shape.account.shape.reports.element.extend(
          { publishedAt: z.date().nullable() },
        ),
      ),
      signedAt: z.date().nullable(),
      updatedAt: z.date(),
    }),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const listIntakesActionNativeResultSchema = z.array(
  listIntakesActionOutputSchema.element.extend({
    accessClaimedAt: z.date().nullable(),
    answers: listIntakesActionOutputSchema.element.shape.answers.catchall(
      z.unknown(),
    ),
    appliedAt: z.date().nullable(),
    billingAcknowledgedAt: z.date().nullable(),
    createdAt: z.date(),
    guestListConsentAt: z.date().nullable(),
    instagramLinkConfirmedAt: z.date().nullable(),
    submittedAt: z.date(),
    updatedAt: z.date(),
    zernioVerifiedAt: z.date().nullable(),
  }),
);

/** Native service result; the existing wire contract validates its JSON projection. */
export const previewIntakeApplyActionNativeResultSchema =
  previewIntakeApplyActionOutputSchema.extend({
    intake: previewIntakeApplyActionOutputSchema.shape.intake.extend({
      accessClaimedAt: z.date().nullable(),
      account:
        previewIntakeApplyActionOutputSchema.shape.intake.shape.account.extend({
          createdAt: z.date(),
          deletedAt: z.date().nullable(),
          signedAt: z.date().nullable(),
          updatedAt: z.date(),
        }),
      answers:
        previewIntakeApplyActionOutputSchema.shape.intake.shape.answers.catchall(
          z.unknown(),
        ),
      appliedAt: z.date().nullable(),
      billingAcknowledgedAt: z.date().nullable(),
      brand: previewIntakeApplyActionOutputSchema.shape.intake.shape.brand
        .unwrap()
        .extend({
          brandIdentity:
            previewIntakeApplyActionOutputSchema.shape.intake.shape.brand
              .unwrap()
              .shape.brandIdentity.unwrap()
              .extend({
                raw: z.unknown().optional(),
              })
              .nullable(),
          businessStageAt: z.date().nullable(),
          createdAt: z.date(),
          deletedAt: z.date().nullable(),
          deliveryStageAt: z.date().nullable(),
          industryResearch:
            previewIntakeApplyActionOutputSchema.shape.intake.shape.brand
              .unwrap()
              .shape.industryResearch.unwrap()
              .catchall(z.unknown())
              .nullable(),
          lastAccessCheckAt: z.date().nullable(),
          updatedAt: z.date(),
          wanderOsCheckedAt: z.date().nullable(),
        })
        .nullable(),
      createdAt: z.date(),
      guestListConsentAt: z.date().nullable(),
      instagramLinkConfirmedAt: z.date().nullable(),
      submittedAt: z.date(),
      updatedAt: z.date(),
      zernioVerifiedAt: z.date().nullable(),
    }),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const createPerformanceAccountActionNativeResultSchema =
  createPerformanceAccountActionOutputSchema.extend({
    account: createPerformanceAccountActionOutputSchema.shape.account.extend({
      createdAt: z.date(),
      deletedAt: z.date().nullable(),
      signedAt: z.date().nullable(),
      updatedAt: z.date(),
    }),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const updatePerformanceAccountActionNativeResultSchema =
  createPerformanceAccountActionNativeResultSchema;

/** Native service result; the existing wire contract validates its JSON projection. */
export const addPerformancePropertyActionNativeResultSchema =
  addPerformancePropertyActionOutputSchema.extend({
    property: addPerformancePropertyActionOutputSchema.shape.property.extend({
      createdAt: z.date(),
      deletedAt: z.date().nullable(),
      updatedAt: z.date(),
    }),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const updatePerformancePropertyActionNativeResultSchema =
  addPerformancePropertyActionNativeResultSchema;

/** Native service result; the existing wire contract validates its JSON projection. */
export const openPerformanceCycleActionNativeResultSchema =
  openPerformanceCycleActionOutputSchema.extend({
    cycle: openPerformanceCycleActionOutputSchema.shape.cycle.extend({
      actualSpendAt: z.date().nullable(),
      createdAt: z.date(),
      endAt: z.date().nullable(),
      feePaidAt: z.date().nullable(),
      mediaPaidAt: z.date().nullable(),
      startAt: z.date().nullable(),
      updatedAt: z.date(),
    }),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const updatePerformanceCycleActionNativeResultSchema =
  openPerformanceCycleActionNativeResultSchema;

/** Native service result; the existing wire contract validates its JSON projection. */
export const searchAttachableCampaignsActionNativeResultSchema =
  searchAttachableCampaignsActionOutputSchema.extend({
    campaigns: z.array(
      searchAttachableCampaignsActionOutputSchema.shape.campaigns.element.extend(
        { startAt: z.date().nullable() },
      ),
    ),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const listSponsoredAbandonmentActionNativeResultSchema =
  listSponsoredAbandonmentActionOutputSchema.extend({
    events: z.array(
      listSponsoredAbandonmentActionOutputSchema.shape.events.element.extend({
        abandonedAt: z.date().nullable(),
      }),
    ),
  });
