import { steerSchema } from "@/lib/generation-steer";
import {
  listSponsoredAbandonmentActionNativeResultSchema,
  searchAttachableCampaignsActionNativeResultSchema,
  updatePerformanceCycleActionNativeResultSchema,
  openPerformanceCycleActionNativeResultSchema,
  updatePerformancePropertyActionNativeResultSchema,
  addPerformancePropertyActionNativeResultSchema,
  updatePerformanceAccountActionNativeResultSchema,
  createPerformanceAccountActionNativeResultSchema,
  previewIntakeApplyActionNativeResultSchema,
  listIntakesActionNativeResultSchema,
  getPerformanceAccountActionNativeResultSchema,
  listPerformanceAccountsActionNativeResultSchema,
  listPerformanceAccountsActionOutputSchema,
  getPerformanceAccountActionOutputSchema,
  listIntakesActionOutputSchema,
  previewIntakeApplyActionOutputSchema,
  verifyIntakeAccessActionOutputSchema,
  createPerformanceAccountActionOutputSchema,
  updatePerformanceAccountActionOutputSchema,
  addPerformancePropertyActionOutputSchema,
  updatePerformancePropertyActionOutputSchema,
  openPerformanceCycleActionOutputSchema,
  updatePerformanceCycleActionOutputSchema,
  searchAttachableCampaignsActionOutputSchema,
  refreshPerformanceCycleSpendActionOutputSchema,
  listSponsoredAbandonmentActionOutputSchema,
  syncAdCampaignsActionOutputSchema,
  attachToPerformanceCycleActionOutputSchema,
} from "./outputs/performance";

import { brandForAssistant } from "./brand-output";

import "server-only";
import { appliedEvidenceSchema } from "@/lib/applied-evidence";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";

import { PUSHABLE_AD_PLATFORMS } from "@/lib/ad-platforms";
import { PERFORMANCE_PLANS } from "@/lib/performance-billing";

import {
  addPerformanceProperty,
  addPerformancePropertySchema,
  refreshPerformanceCycleSpend,
  listSponsoredAbandonment,
  searchAttachableCampaigns,
  searchAttachableCampaignsSchema,
  sponsoredAbandonmentSchema,
  attachToPerformanceCycle,
  attachToPerformanceCycleSchema,
  createPerformanceAccount,
  createPerformanceAccountSchema,
  getPerformanceAccount,
  listPerformanceAccounts,
  openPerformanceCycle,
  openPerformanceCycleSchema,
  updatePerformanceAccount,
  updatePerformanceAccountSchema,
  updatePerformanceCycle,
  updatePerformanceCycleSchema,
  updatePerformanceProperty,
  updatePerformancePropertySchema,
  type PerformanceActor,
} from "@/server/services/performance.service";

import {
  applyPerformanceIntake,
  campaignPrefillFromIntake,
  listPerformanceIntakes,
  previewIntakeApply,
  verifyIntakeAccess,
} from "@/server/services/performance-intake.service";
import { promoteBrandToClient } from "@/server/services/brand-relationship.service";

import { syncZernioAds } from "@/server/services/ads-sync.service";
import {
  listBrandHomes,
  setHomeFeatured,
  setHomeHero,
} from "@/server/services/homes.service";
import { suggestFeaturedHomes } from "@/server/services/featured-home-suggestions.service";
import { reviewPortfolio } from "@/server/services/portfolio-review.service";
import { requireOwnedBrand } from "./brand-access";

import { growthAction, GrowthActionError } from "./types";

const actorFrom = (ctx: { orgId: string }): PerformanceActor => ({
  orgId: ctx.orgId,
});

export const listPerformanceAccountsAction = growthAction({
  nativeOutputSchema: listPerformanceAccountsActionNativeResultSchema,
  outputSchema: listPerformanceAccountsActionOutputSchema,
  description:
    "List Performance accounts (the commercial record of each property manager paying Wander to run performance marketing for their homes) with their properties and recent billing cycles.",
  inputSchema: z.object({}),
  execute: (_input, ctx) => listPerformanceAccounts(actorFrom(ctx)),
});

export const getPerformanceAccountAction = growthAction({
  nativeOutputSchema: getPerformanceAccountActionNativeResultSchema,
  outputSchema: getPerformanceAccountActionOutputSchema,
  description:
    "Read one Performance account completely: contact, plan, the homes on the record, every billing cycle, report list, and the delivery attached to each cycle (campaigns, lifecycle campaigns, amplification targets). Delivery holds only what was attached to a cycle with attachToCycle, so it is usually empty: it never means the brand has no campaigns or ads. Read those with adsRead.listCampaigns.",
  inputSchema: z.object({ accountId: z.string().min(1) }),
  execute: (input, ctx) =>
    getPerformanceAccount(actorFrom(ctx), input.accountId),
});

const brandIdInput = z
  .string()
  .startsWith("brand_")
  .describe("The brand_ ID from the page context or a brand lookup.");

export const featuredHomesAction = growthAction({
  description:
    "The featured homes of a Performance brand: the ticked homes on its Setup page, in display order, each with the homeId performanceWrite.updateHome takes. Ads, previews and the setup checklist work from these homes.",
  inputSchema: z.object({ brandId: brandIdInput }),
  outputSchema: z.object({
    homes: z.array(
      z.object({
        homeId: z.string(),
        listingId: z.string().nullable(),
        name: z.string(),
        url: z.string(),
        place: z.string(),
        bedrooms: z.number().nullable(),
        guests: z.number().nullable(),
        heroSourceUrl: z.string().nullable(),
      }),
    ),
  }),
  examples: [{ brandId: "brand_winterpark" }],
  execute: async (input, ctx) => {
    const brand = await requireOwnedBrand(input.brandId, ctx);
    const homes = await listBrandHomes(brand.id);
    return {
      homes: homes.map((home) => ({
        homeId: home.id,
        listingId: home.source === "wanderos" ? home.externalId : null,
        name: home.name,
        url: home.url,
        place: [home.city, home.state].filter(Boolean).join(", "),
        bedrooms: home.bedrooms,
        guests: home.guests,
        heroSourceUrl: home.heroSourceUrl,
      })),
    };
  },
});

export const suggestFeaturedHomesAction = growthAction({
  description:
    "Suggest which homes a Performance brand should feature: its hallmark homes, ranked on direct-site bookings over 12 months, then how the home sells across all channels over 90 days, then reviews, with one look at the shortlist's hero photos to break ties. Returns the picks and the scored shortlist. Read-only itself: show the picks with the numbers and feature them with performanceWrite.updateHome once the operator agrees (a playbook the operator started counts as agreeing). Open nights are context, never a reason to drop a home: a booked-out hallmark home still earns the click.",
  inputSchema: z.object({
    brandId: brandIdInput,
    steer: steerSchema,
    count: z
      .number()
      .int()
      .min(3)
      .max(6)
      .default(5)
      .describe(
        "How many to feature. Spend goes further on a few strong bets.",
      ),
  }),
  outputSchema: z.object({
    picks: z.array(z.string()),
    candidates: z.array(
      z.object({
        homeId: z.string(),
        listingId: z.string(),
        name: z.string(),
        directBookings: z.number(),
        directValue: z.number(),
        sold90: z.number().nullable(),
        open60: z.number().nullable(),
        reviews: z.number(),
        reviewScore: z.number().nullable(),
        picked: z.boolean(),
      }),
    ),
  }),
  examples: [{ brandId: "brand_winterpark", count: 5 }],
  execute: async (input, ctx) => {
    const brand = await requireOwnedBrand(input.brandId, ctx);
    return suggestFeaturedHomes({
      brandId: brand.id,
      brandName: brand.name,
      brandStory: brand.story,
      count: input.count,
      steer: input.steer,
      creativeDirection: brand.creativeDirection,
    });
  },
});

export const reviewPortfolioAction = growthAction({
  description:
    "Review a brand's creative as a set: every included catalog card (surface catalog), or every ad of a campaign or of the brand's draft set with no campaign (surface ads). Renders the cards onto numbered sheets and returns an overall read plus up to twelve surgical notes, each naming one card by homeId or adId. Changes nothing itself. Present the overall read and the changes you would make, ask once which to apply, then apply those one card at a time (a catalog note's headline is the exact replacement title; on a finished card the text is part of the supplied artwork, so list those headlines for whoever remakes it instead of saving them), with the per-card tools (adsWrite.editCatalogCard and adsWrite.setHomeHero for catalog cards; adsWrite.setAdCopy, adsWrite.replaceAdCard or adsWrite.saveIdea for ads), and report what changed in a short list. If a note reveals something about the brand as a whole, add it to the brand story with brandWrite.update.",
  inputSchema: z.object({
    brandId: brandIdInput,
    surface: z.enum(["catalog", "ads"]),
    steer: steerSchema,
    campaignId: z
      .string()
      .optional()
      .describe("For surface ads: the campaign. Omit for the draft set."),
  }),
  outputSchema: z.object({
    surface: z.enum(["catalog", "ads"]),
    reviewed: z.number(),
    skipped: z.number(),
    /** Cards that would not render; worth fixing before anything else. */
    unrendered: z.array(z.string()),
    overall: z.string(),
    notes: z.array(
      z.object({
        number: z.number(),
        name: z.string(),
        homeId: z.string().optional(),
        adId: z.string().optional(),
        note: z.string(),
        /** Catalog: the exact replacement headline, when the headline is the fix. */
        headline: z.string().optional(),
      }),
    ),
  }),
  examples: [{ brandId: "brand_winterpark", surface: "catalog" }],
  execute: async (input, ctx) => {
    const brand = await requireOwnedBrand(input.brandId, ctx);
    return reviewPortfolio({
      userId: ctx.userId,
      brandId: brand.id,
      brandName: brand.name,
      brandStory: brand.story,
      creativeDirection: brand.creativeDirection,
      steer: input.steer,
      surface: input.surface,
      campaignId: input.campaignId,
    });
  },
});

export const updateHomeAction = growthAction({
  description:
    "Update one home of a Performance brand: feature it (it joins the Setup page grid's featured set, which ads and previews draw from) or take it out, and set or clear its hero photo. Pass the homeId from mediaLibraryRead.listingPhotos or featuredHomes; send only the fields to change. One home per call: feature five homes with five calls. Featuring makes no ads.",
  inputSchema: z
    .object({
      homeId: z.string().min(1),
      featured: z.boolean().optional(),
      heroSourceUrl: z
        .string()
        .url()
        .nullable()
        .optional()
        .describe("One of the home's own photo URLs, or null to clear it."),
    })
    .refine(
      (value) =>
        value.featured !== undefined || value.heroSourceUrl !== undefined,
      { message: "Send featured, heroSourceUrl, or both." },
    ),
  outputSchema: z.object({
    homeId: z.string(),
    featured: z.boolean().optional(),
    heroSourceUrl: z.string().nullable().optional(),
  }),
  examples: [{ homeId: "home_01", featured: true }],
  execute: async (input, ctx) => {
    const result: {
      homeId: string;
      featured?: boolean;
      heroSourceUrl?: string | null;
    } = { homeId: input.homeId };
    if (input.featured !== undefined)
      result.featured = (
        await setHomeFeatured({
          homeId: input.homeId,
          orgId: ctx.orgId,
          featured: input.featured,
        })
      ).featured;
    if (input.heroSourceUrl !== undefined)
      result.heroSourceUrl = (
        await setHomeHero({
          homeId: input.homeId,
          orgId: ctx.orgId,
          sourceUrl: input.heroSourceUrl,
        })
      ).heroSourceUrl;
    return result;
  },
});

export const clientCampaignContextAction = growthAction({
  description:
    "What a Performance client agreed to and what we would advertise for them: the monthly media budget, whether they asked for every home, the property URLs on the record, and where those homes are (countries, state codes, resolvable region names, cities). Read this before proposing campaigns or audiences for a client brand — the geography is a fact about their portfolio, not a recommendation about who to target.",
  inputSchema: z.object({
    brandId: z
      .string()
      .startsWith("brand_")
      .describe(
        "The brand_ ID returned by openCampaign or a brand lookup, not a URL slug or domain.",
      ),
  }),
  outputSchema: z.object({
    accountId: z.string().nullable(),
    mediaBudgetDollars: z.number().nullable(),
    landingUrl: z.string().nullable(),
    propertyUrls: z.array(z.string()),
    allProperties: z.boolean(),
    geography: z.object({
      countries: z.array(z.string()).optional(),
      states: z.array(z.string()).optional(),
      regions: z.array(z.string()).optional(),
      cities: z.array(z.string()).optional(),
    }),
  }),
  examples: [{ brandId: "brand_winterpark" }],
  execute: (input, ctx) => campaignPrefillFromIntake(actorFrom(ctx), input),
});

export const listIntakesAction = growthAction({
  nativeOutputSchema: listIntakesActionNativeResultSchema,
  outputSchema: listIntakesActionOutputSchema,
  description:
    "List Performance onboarding submissions in the authenticated workspace, newest first: what they answered, the budget they agreed to, whether it has been applied, and whether their ad access has been verified. Supply accountId to list one account, or omit it to list all accounts in the workspace.",
  inputSchema: z.object({ accountId: z.string().min(1).optional() }),
  examples: [{}, { accountId: "perf_01" }],
  execute: (input, ctx) =>
    listPerformanceIntakes(actorFrom(ctx), input.accountId),
});

export const previewIntakeApplyAction = growthAction({
  nativeOutputSchema: previewIntakeApplyActionNativeResultSchema,
  outputSchema: previewIntakeApplyActionOutputSchema,
  description:
    "Show exactly what applying an intake would write: the billing period and budget, the homes that become the brand's Client’s picks group (made primary, beside our Featured homes suggestion), which commercial property rows are new, and anything blocking it. Read-only. Always call this before applyIntake and show the operator the result.",
  inputSchema: z.object({ intakeId: z.string().min(1) }),
  examples: [{ intakeId: "pint_01" }],
  execute: async (input, ctx) => {
    const preview = await previewIntakeApply(actorFrom(ctx), input.intakeId);
    return {
      ...preview,
      intake: {
        ...preview.intake,
        brand: preview.intake.brand
          ? brandForAssistant(preview.intake.brand)
          : null,
      },
    };
  },
});

export const applyIntakeAction = growthAction({
  description:
    "Promote a filed intake into the records that own each fact: the account's status and notes, the month's media budget on its cycle, and sets the brand's Client’s picks home group to the selected catalog homes and makes it the primary group (our Featured homes suggestion stays as its own group), aligning commercial property rows and locations. Existing campaign snapshots stay unchanged. Applies once per intake and refuses a second run. Growth's own tables only; nothing reaches an ad platform.",
  inputSchema: z.object({
    intakeId: z.string().min(1),
    mediaBudgetDollars: z.number().int().min(0).nullable().optional(),
  }),
  outputSchema: z.object({
    ...appliedEvidenceSchema.shape,
    intakeId: z.string(),
    /** One line per record that changed, in the order they were written. */
    written: z.array(z.string()),
  }),
  examples: [
    { intakeId: "pint_01" },
    { intakeId: "pint_01", mediaBudgetDollars: 5000 },
  ],
  execute: (input, ctx) => applyPerformanceIntake(actorFrom(ctx), input),
});

export const verifyIntakeAccessAction = growthAction({
  outputSchema: verifyIntakeAccessActionOutputSchema,
  description:
    "Check whether the client's Leadsie grant has landed: reads the Pages and ad accounts Wander's Meta connection can now manage and records the match when exactly one Page name looks like theirs. Reads the provider and writes only Growth's own verification stamps.",
  inputSchema: z.object({ intakeId: z.string().min(1) }),
  examples: [{ intakeId: "pint_01" }],
  execute: (input, ctx) => verifyIntakeAccess(actorFrom(ctx), input.intakeId),
});

export const promoteToClientAction = growthAction({
  description:
    "Record that a brand signed: marks it a client and opens its commercial record with today's date, creating the performance account if the deal closed before they filled the form. Safe to repeat — a re-run keeps the original signing date.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    plan: z
      .enum(PERFORMANCE_PLANS)
      .nullable()
      .optional()
      .describe("Leave out for performance_plus, the standard plan."),
  }),
  outputSchema: z.object({
    accountId: z.string(),
    /** False when they already had a commercial record. */
    created: z.boolean(),
  }),
  examples: [{ brandId: "brand_winterpark" }],
  execute: (input, ctx) => promoteBrandToClient(actorFrom(ctx), input),
});

export const createPerformanceAccountAction = growthAction({
  nativeOutputSchema: createPerformanceAccountActionNativeResultSchema,
  outputSchema: createPerformanceAccountActionOutputSchema,
  description:
    "Onboard a performance customer. Commercial record only — payment is handled offline; link a brand row separately if their scraped identity exists.",
  inputSchema: createPerformanceAccountSchema,
  execute: (input, ctx) => createPerformanceAccount(actorFrom(ctx), input),
});

export const updatePerformanceAccountAction = growthAction({
  nativeOutputSchema: updatePerformanceAccountActionNativeResultSchema,
  outputSchema: updatePerformanceAccountActionOutputSchema,
  description:
    "Update a performance account's contact, plan, status, brand link, or notes.",
  inputSchema: updatePerformanceAccountSchema,
  execute: (input, ctx) => updatePerformanceAccount(actorFrom(ctx), input),
});

export const addPerformancePropertyAction = growthAction({
  nativeOutputSchema: addPerformancePropertyActionNativeResultSchema,
  outputSchema: addPerformancePropertyActionOutputSchema,
  description:
    "Add one of the client's homes to a Performance account. The monolith propertyId can be backfilled later; rows without it have no booking attribution yet.",
  inputSchema: addPerformancePropertySchema,
  execute: (input, ctx) => addPerformanceProperty(actorFrom(ctx), input),
});

export const updatePerformancePropertyAction = growthAction({
  nativeOutputSchema: updatePerformancePropertyActionNativeResultSchema,
  outputSchema: updatePerformancePropertyActionOutputSchema,
  description:
    "Update a home's title, notes, or backfill its monolith property id (the booking-attribution join key).",
  inputSchema: updatePerformancePropertySchema,
  execute: (input, ctx) => updatePerformanceProperty(actorFrom(ctx), input),
});

export const openPerformanceCycleAction = growthAction({
  nativeOutputSchema: openPerformanceCycleActionNativeResultSchema,
  outputSchema: openPerformanceCycleActionOutputSchema,
  description:
    "Open a billing cycle (YYYY-MM, unique per account). Record billedAmount and mediaBudget separately — reports must be honest about which number spend is measured against.",
  inputSchema: openPerformanceCycleSchema,
  execute: (input, ctx) => openPerformanceCycle(actorFrom(ctx), input),
});

export const updatePerformanceCycleAction = growthAction({
  nativeOutputSchema: updatePerformanceCycleActionNativeResultSchema,
  outputSchema: updatePerformanceCycleActionOutputSchema,
  description:
    "Update a cycle's status (planned → live → reporting → closed), amounts, dates, or notes.",
  inputSchema: updatePerformanceCycleSchema,
  execute: (input, ctx) => updatePerformanceCycle(actorFrom(ctx), input),
});

export const searchAttachableCampaignsAction = growthAction({
  nativeOutputSchema: searchAttachableCampaignsActionNativeResultSchema,
  outputSchema: searchAttachableCampaignsActionOutputSchema,
  description:
    "Find platform ad campaigns that are not yet attached to any performance cycle, newest first. Use this before attaching so the campaign is chosen by id rather than guessed from its name.",
  inputSchema: searchAttachableCampaignsSchema,
  execute: (input, ctx) => searchAttachableCampaigns(actorFrom(ctx), input),
});

export const refreshPerformanceCycleSpendAction = growthAction({
  outputSchema: refreshPerformanceCycleSpendActionOutputSchema,
  description:
    "Recompute one cycle's observed spend from the campaigns attached to it. Reads the unrounded per-campaign figures, so it answers whether a customer is being overspent against their media budget.",
  inputSchema: z.object({ cycleId: z.string().min(1) }),
  execute: (input, ctx) =>
    refreshPerformanceCycleSpend(actorFrom(ctx), input.cycleId),
});

export const listSponsoredAbandonmentAction = growthAction({
  nativeOutputSchema: listSponsoredAbandonmentActionNativeResultSchema,
  outputSchema: listSponsoredAbandonmentActionOutputSchema,
  description:
    "Guests who abandoned checkout (or wishlisted) on a Performance client's homes, hottest first. Joined on the listing id the tracked event carries, never on property name. Use this to answer what a customer's boosted homes produced and to hand BDRs a follow-up list. Read-only; it does not contact anyone.",
  inputSchema: sponsoredAbandonmentSchema,
  execute: (input, ctx) => listSponsoredAbandonment(actorFrom(ctx), input),
});

export const syncAdCampaignsAction = growthAction({
  outputSchema: syncAdCampaignsActionOutputSchema,
  description:
    "Pull ad campaigns from Zernio into Growth so they can be attached to a performance cycle, then reprice every cycle's observed spend. Bounded to recent campaigns by default because the provider returns every campaign an account has ever had; widen with sinceDays or drop the window with sinceDays null. Reads the provider and writes only our own mirror rows.",
  inputSchema: z.object({
    brandSlug: z.string().trim().min(1).default("wander"),
    platform: z.enum(PUSHABLE_AD_PLATFORMS).default("meta_ads"),
    sinceDays: z
      .number()
      .int()
      .min(1)
      .max(1_095)
      .nullable()
      .optional()
      .describe("Ingest window in days; null for no window. Defaults to 120."),
    minSpend: z
      .number()
      .min(0)
      .optional()
      .describe("Skip campaigns below this observed spend in whole dollars."),
    statuses: z.array(z.string().trim().min(1)).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  }),
  execute: async (input, ctx) => {
    // The Zernio sync is keyed by slug alone, so scope it here.
    const brand = await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.slug, input.brandSlug),
        eq(brandTable.organizationId, ctx.orgId),
        isNull(brandTable.deletedAt),
      ),
      columns: { id: true },
    });
    if (!brand)
      throw new GrowthActionError(
        "not_found",
        `No brand "${input.brandSlug}" in this organization.`,
      );
    return syncZernioAds({
      brandSlug: input.brandSlug,
      platform: input.platform,
      sinceDays: input.sinceDays,
      minSpend: input.minSpend,
      statuses: input.statuses,
      limit: input.limit,
    });
  },
});

export const attachToPerformanceCycleAction = growthAction({
  outputSchema: attachToPerformanceCycleActionOutputSchema,
  description:
    "Attach one delivery row to a performance cycle so it counts toward the customer's report, or detach it with cycleId null. Use platformCampaign for one platform delivery; campaign attaches all platform deliveries under that planned campaign. A platform delivery's cycle is independent of its planned campaign parent. This tags existing delivery; it never creates ads or sends anything.",
  inputSchema: attachToPerformanceCycleSchema,
  execute: (input, ctx) => attachToPerformanceCycle(actorFrom(ctx), input),
});
