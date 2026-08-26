import "server-only";

import { z } from "zod";

import {
  addPerformanceProperty,
  addPerformancePropertySchema,
  refreshPerformanceCycleSpend,
  searchAttachableCampaigns,
  searchAttachableCampaignsSchema,
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
    "Read one performance account completely: contact, plan, sponsored properties, every billing cycle, report list, and the delivery attached to each cycle (initiatives, lifecycle campaigns, amplification targets).",
  inputSchema: z.object({ accountId: z.string().min(1) }),
  execute: (input, ctx) => getPerformanceAccount(actorFrom(ctx), input.accountId),
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
    "Attach one delivery row to a performance cycle so it counts toward the customer's report, or detach it with cycleId null. Kind 'campaign' is the one to use for an ad campaign that already exists on the platform: campaigns reach a cycle through an initiative, and this creates or reuses a wrapper initiative when the campaign has none. This tags existing delivery; it never creates ads or sends anything.",
  inputSchema: attachToPerformanceCycleSchema,
  execute: (input, ctx) => attachToPerformanceCycle(actorFrom(ctx), input),
});
