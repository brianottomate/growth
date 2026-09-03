import "server-only";

import { z } from "zod";

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

import { growthAction } from "./types";

const actorFrom = (ctx: { orgId: string }): PerformanceActor => ({
  orgId: ctx.orgId,
});

export const listPerformanceAccountsAction = growthAction({
  description:
    "List performance accounts (property managers paying for sponsored placement on Wander's marketing surfaces) with their properties and recent billing cycles.",
  inputSchema: z.object({}),
  execute: (_input, ctx) => listPerformanceAccounts(actorFrom(ctx)),
});

export const getPerformanceAccountAction = growthAction({
  description:
    "Read one performance account completely: contact, plan, sponsored properties, every billing cycle, report list, and the delivery attached to each cycle (campaigns, lifecycle campaigns, amplification targets).",
  inputSchema: z.object({ accountId: z.string().min(1) }),
  execute: (input, ctx) =>
    getPerformanceAccount(actorFrom(ctx), input.accountId),
});

export const clientCampaignContextAction = growthAction({
  description:
    "What a Performance+ client agreed to and what we would advertise for them: the monthly media budget, whether they asked for every home, the property URLs on the record, and where those homes are (countries, state codes, resolvable region names, cities). Read this before proposing campaigns or audiences for a client brand — the geography is a fact about their portfolio, not a recommendation about who to target.",
  inputSchema: z.object({ brandId: z.string().min(1) }),
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
  description:
    "List the onboarding forms a Performance+ client has filed for one account, newest first: what they answered, the budget they agreed to, whether it has been applied, and whether their ad access has been verified.",
  inputSchema: z.object({ accountId: z.string().min(1) }),
  examples: [{ accountId: "perf_01" }],
  execute: (input, ctx) =>
    listPerformanceIntakes(actorFrom(ctx), input.accountId),
});

export const previewIntakeApplyAction = growthAction({
  description:
    "Show exactly what applying an intake would write: the billing period and budget, which homes are new, and anything blocking it. Read-only. Always call this before applyIntake and show the operator the result.",
  inputSchema: z.object({ intakeId: z.string().min(1) }),
  examples: [{ intakeId: "pint_01" }],
  execute: (input, ctx) => previewIntakeApply(actorFrom(ctx), input.intakeId),
});

export const applyIntakeAction = growthAction({
  description:
    "Promote a filed intake into the records that own each fact: the account's status and notes, the month's media budget on its cycle, and the client's homes as property rows with their locations. Applies once per intake and refuses a second run. Growth's own tables only; nothing reaches an ad platform.",
  inputSchema: z.object({
    intakeId: z.string().min(1),
    mediaBudgetDollars: z.number().int().min(0).nullable().optional(),
  }),
  outputSchema: z.object({
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
    plan: z.string().min(1).nullable().optional(),
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
  description:
    "Onboard a performance customer. Commercial record only — payment is handled offline; link a brand row separately if their scraped identity exists.",
  inputSchema: createPerformanceAccountSchema,
  execute: (input, ctx) => createPerformanceAccount(actorFrom(ctx), input),
});

export const updatePerformanceAccountAction = growthAction({
  description:
    "Update a performance account's contact, plan, status, brand link, or notes.",
  inputSchema: updatePerformanceAccountSchema,
  execute: (input, ctx) => updatePerformanceAccount(actorFrom(ctx), input),
});

export const addPerformancePropertyAction = growthAction({
  description:
    "Add a sponsored wander.com property to a performance account. The monolith propertyId can be backfilled later; rows without it have no booking attribution yet.",
  inputSchema: addPerformancePropertySchema,
  execute: (input, ctx) => addPerformanceProperty(actorFrom(ctx), input),
});

export const updatePerformancePropertyAction = growthAction({
  description:
    "Update a sponsored property's title, notes, or backfill its monolith property id (the booking-attribution join key).",
  inputSchema: updatePerformancePropertySchema,
  execute: (input, ctx) => updatePerformanceProperty(actorFrom(ctx), input),
});

export const openPerformanceCycleAction = growthAction({
  description:
    "Open a billing cycle (YYYY-MM, unique per account). Record billedAmount and mediaBudget separately — reports must be honest about which number spend is measured against.",
  inputSchema: openPerformanceCycleSchema,
  execute: (input, ctx) => openPerformanceCycle(actorFrom(ctx), input),
});

export const updatePerformanceCycleAction = growthAction({
  description:
    "Update a cycle's status (planned → live → reporting → closed), amounts, dates, or notes.",
  inputSchema: updatePerformanceCycleSchema,
  execute: (input, ctx) => updatePerformanceCycle(actorFrom(ctx), input),
});

export const searchAttachableCampaignsAction = growthAction({
  description:
    "Find platform ad campaigns that are not yet attached to any performance cycle, newest first. Use this before attaching so the campaign is chosen by id rather than guessed from its name.",
  inputSchema: searchAttachableCampaignsSchema,
  execute: (input, ctx) => searchAttachableCampaigns(actorFrom(ctx), input),
});

export const refreshPerformanceCycleSpendAction = growthAction({
  description:
    "Recompute one cycle's observed spend from the campaigns attached to it. Reads the unrounded per-campaign figures, so it answers whether a customer is being overspent against their media budget.",
  inputSchema: z.object({ cycleId: z.string().min(1) }),
  execute: (input, ctx) =>
    refreshPerformanceCycleSpend(actorFrom(ctx), input.cycleId),
});

export const listSponsoredAbandonmentAction = growthAction({
  description:
    "Guests who abandoned checkout (or wishlisted) on a Performance+ customer's sponsored homes, hottest first. Joined on the listing id the tracked event carries, never on property name. Use this to answer what a customer's boosted homes produced and to hand BDRs a follow-up list. Read-only; it does not contact anyone.",
  inputSchema: sponsoredAbandonmentSchema,
  execute: (input, ctx) => listSponsoredAbandonment(actorFrom(ctx), input),
});

export const syncAdCampaignsAction = growthAction({
  description:
    "Pull ad campaigns from Zernio into Growth so they can be attached to a performance cycle, then reprice every cycle's observed spend. Bounded to recent campaigns by default because the provider returns every campaign an account has ever had; widen with sinceDays or drop the window with sinceDays null. Reads the provider and writes only our own mirror rows.",
  inputSchema: z.object({
    brandSlug: z.string().trim().min(1).default("wander"),
    platform: z.enum(["meta_ads", "google_ads"]).default("meta_ads"),
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
  execute: (input) =>
    syncZernioAds({
      brandSlug: input.brandSlug,
      platform: input.platform,
      sinceDays: input.sinceDays,
      minSpend: input.minSpend,
      statuses: input.statuses,
      limit: input.limit,
    }),
});

export const attachToPerformanceCycleAction = growthAction({
  description:
    "Attach one delivery row to a performance cycle so it counts toward the customer's report, or detach it with cycleId null. Kind 'campaign' is the one to use for an ad campaign that already exists on the platform: platform campaigns reach a cycle through a campaign, and this creates or reuses a wrapper campaign when the platform campaign has none. This tags existing delivery; it never creates ads or sends anything.",
  inputSchema: attachToPerformanceCycleSchema,
  execute: (input, ctx) => attachToPerformanceCycle(actorFrom(ctx), input),
});
