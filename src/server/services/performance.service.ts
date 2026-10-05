import "server-only";

import { and, desc, eq, gte, ilike, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import {
  platformAdTable,
  amplificationTargetTable,
  platformCampaignTable,
  funnelStateTable,
  campaignTable,
  lifecycleCampaignTable,
  performanceAccountTable,
  performanceCycleTable,
  performancePropertyTable,
  performanceReportTable,
} from "@/server/db/schema";

// Performance accounts — property managers paying to be featured on Wander's
// marketing surfaces. Commercial layer only: delivery stays in the existing
// campaign / lifecycle / amplification tables and attaches to a cycle via
// their nullable performanceCycleId FK (see db/performance-schema.ts).

export type PerformanceActor = { orgId: string };

export class PerformanceError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "BAD_REQUEST",
    message: string,
  ) {
    super(message);
  }
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const createPerformanceAccountSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contactName: z.string().trim().min(1).max(160).nullable().default(null),
  contactEmail: z.string().trim().email().nullable().default(null),
  website: z.string().trim().url().nullable().default(null),
  plan: z.string().trim().min(1).max(80).nullable().default(null),
  status: z
    .enum(["prospect", "onboarding", "active", "paused", "churned"])
    .default("prospect"),
  brandId: z.string().min(1).nullable().default(null),
  notes: z.string().trim().max(4_000).nullable().default(null),
});

export const updatePerformanceAccountSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().trim().min(1).max(160).optional(),
  contactName: z.string().trim().min(1).max(160).nullable().optional(),
  contactEmail: z.string().trim().email().nullable().optional(),
  website: z.string().trim().url().nullable().optional(),
  plan: z.string().trim().min(1).max(80).nullable().optional(),
  status: z
    .enum(["prospect", "onboarding", "active", "paused", "churned"])
    .optional(),
  brandId: z.string().min(1).nullable().optional(),
  notes: z.string().trim().max(4_000).nullable().optional(),
});

export const addPerformancePropertySchema = z.object({
  accountId: z.string().min(1),
  wanderUrl: z
    .string()
    .trim()
    .url()
    .refine((url) => new URL(url).hostname.endsWith("wander.com"), {
      message: "Sponsored properties live on wander.com",
    }),
  propertyId: z.string().trim().min(1).nullable().default(null),
  title: z.string().trim().min(1).max(200).nullable().default(null),
  notes: z.string().trim().max(2_000).nullable().default(null),
});

export const updatePerformancePropertySchema = z.object({
  propertyId: z.string().min(1).describe("The performance_property row id"),
  monolithPropertyId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1).max(200).nullable().optional(),
  notes: z.string().trim().max(2_000).nullable().optional(),
});

export const openPerformanceCycleSchema = z.object({
  accountId: z.string().min(1),
  period: z
    .string()
    .regex(PERIOD_RE, "period must be YYYY-MM")
    .describe('Billing period like "2026-08"; unique per account.'),
  billedAmount: z
    .number()
    .int()
    .positive()
    .nullable()
    .default(null)
    .describe("Whole dollars the customer pays."),
  mediaBudget: z
    .number()
    .int()
    .positive()
    .nullable()
    .default(null)
    .describe("Whole dollars that reach ad platforms."),
  startAt: z.string().datetime().nullable().default(null),
  endAt: z.string().datetime().nullable().default(null),
  notes: z.string().trim().max(4_000).nullable().default(null),
});

export const updatePerformanceCycleSchema = z.object({
  cycleId: z.string().min(1),
  status: z.enum(["planned", "live", "reporting", "closed"]).optional(),
  billedAmount: z.number().int().positive().nullable().optional(),
  mediaBudget: z.number().int().positive().nullable().optional(),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(4_000).nullable().optional(),
});

export const attachToPerformanceCycleSchema = z.object({
  cycleId: z
    .string()
    .min(1)
    .nullable()
    .describe("Target cycle, or null to detach."),
  kind: z.enum([
    "campaign",
    "platformCampaign",
    "lifecycleCampaign",
    "amplificationTarget",
  ]),
  id: z.string().min(1).describe("The delivery row being attached."),
});

export const searchAttachableCampaignsSchema = z.object({
  query: z.string().trim().max(200).optional(),
  platform: z.string().trim().max(40).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

async function requireAccount(actor: PerformanceActor, accountId: string) {
  const account = await db.query.performanceAccountTable.findFirst({
    where: and(
      eq(performanceAccountTable.id, accountId),
      eq(performanceAccountTable.organizationId, actor.orgId),
      isNull(performanceAccountTable.deletedAt),
    ),
  });
  if (!account) {
    throw new PerformanceError(
      "NOT_FOUND",
      `Performance account not found: ${accountId}`,
    );
  }
  return account;
}

async function requireCycle(actor: PerformanceActor, cycleId: string) {
  const cycle = await db.query.performanceCycleTable.findFirst({
    where: eq(performanceCycleTable.id, cycleId),
  });
  if (!cycle) {
    throw new PerformanceError("NOT_FOUND", `Cycle not found: ${cycleId}`);
  }
  await requireAccount(actor, cycle.accountId);
  return cycle;
}

/** One `{ cycleId }` row per delivered thing, tallied by kind. */
export type DeliveryRow = { cycleId: string | null };

/**
 * Three separate queries destructured in one statement, each feeding a
 * different tally. A rename once pointed the emails tally at the ads array and
 * typechecked, because every row is `{ cycleId }` — so the wiring is pulled
 * out here where a test can hold it.
 */
export function countDeliveryByCycle(sources: {
  campaigns: DeliveryRow[];
  lifecycleCampaigns: DeliveryRow[];
  amplifications: DeliveryRow[];
}) {
  const delivery = new Map<
    string,
    { ads: number; emails: number; influencers: number }
  >();
  const bump = (
    cycleId: string | null,
    key: "ads" | "emails" | "influencers",
  ) => {
    if (!cycleId) return;
    const row = delivery.get(cycleId) ?? { ads: 0, emails: 0, influencers: 0 };
    row[key] += 1;
    delivery.set(cycleId, row);
  };
  sources.campaigns.forEach((row) => bump(row.cycleId, "ads"));
  sources.lifecycleCampaigns.forEach((row) => bump(row.cycleId, "emails"));
  sources.amplifications.forEach((row) => bump(row.cycleId, "influencers"));
  return delivery;
}

export async function listPerformanceAccounts(actor: PerformanceActor) {
  const accounts = await db.query.performanceAccountTable.findMany({
    where: and(
      eq(performanceAccountTable.organizationId, actor.orgId),
      isNull(performanceAccountTable.deletedAt),
    ),
    orderBy: desc(performanceAccountTable.createdAt),
    with: {
      properties: {
        where: isNull(performancePropertyTable.deletedAt),
        columns: { id: true, wanderUrl: true, title: true, propertyId: true },
      },
      cycles: {
        orderBy: desc(performanceCycleTable.period),
        columns: {
          id: true,
          period: true,
          status: true,
          billedAmount: true,
          mediaBudget: true,
          actualSpendCents: true,
          actualSpendAt: true,
        },
      },
      reports: {
        columns: { id: true, cycleId: true, status: true },
      },
    },
  });

  // Delivery counts per cycle, so the list can answer "is anything running for
  // this customer" without a per-row round trip.
  const cycleIds = accounts.flatMap((account) =>
    account.cycles.map((cycle) => cycle.id),
  );
  let delivery = new Map<
    string,
    { ads: number; emails: number; influencers: number }
  >();
  if (cycleIds.length > 0) {
    const [campaigns, lifecycleCampaigns, amplifications] = await Promise.all([
      db
        .select({ cycleId: campaignTable.performanceCycleId })
        .from(campaignTable)
        .where(inArray(campaignTable.performanceCycleId, cycleIds)),
      db
        .select({ cycleId: lifecycleCampaignTable.performanceCycleId })
        .from(lifecycleCampaignTable)
        .where(inArray(lifecycleCampaignTable.performanceCycleId, cycleIds)),
      db
        .select({ cycleId: amplificationTargetTable.performanceCycleId })
        .from(amplificationTargetTable)
        .where(inArray(amplificationTargetTable.performanceCycleId, cycleIds)),
    ]);
    delivery = countDeliveryByCycle({
      campaigns,
      lifecycleCampaigns,
      amplifications,
    });
  }

  return {
    accounts: accounts.map((account) => {
      const current = account.cycles[0] ?? null;
      return {
        ...account,
        currentCycle: current
          ? {
              ...current,
              delivery: delivery.get(current.id) ?? {
                ads: 0,
                emails: 0,
                influencers: 0,
              },
              hasReport: account.reports.some(
                (report) => report.cycleId === current.id,
              ),
            }
          : null,
        lifetimeBilled: account.cycles.reduce(
          (total, cycle) => total + (cycle.billedAmount ?? 0),
          0,
        ),
      };
    }),
  };
}

export async function getPerformanceAccount(
  actor: PerformanceActor,
  accountId: string,
) {
  await requireAccount(actor, accountId);
  const account = await db.query.performanceAccountTable.findFirst({
    where: eq(performanceAccountTable.id, accountId),
    with: {
      brand: { columns: { id: true, name: true, slug: true, website: true } },
      properties: { where: isNull(performancePropertyTable.deletedAt) },
      cycles: { orderBy: desc(performanceCycleTable.period) },
      reports: {
        orderBy: desc(performanceReportTable.createdAt),
        columns: {
          id: true,
          cycleId: true,
          periodLabel: true,
          status: true,
          publishedAt: true,
        },
      },
    },
  });
  if (!account) {
    throw new PerformanceError("NOT_FOUND", `Account not found: ${accountId}`);
  }

  // The delivery attached to each cycle, so one read answers "what ran".
  const cycleIds = account.cycles.map((cycle) => cycle.id);
  const [campaigns, lifecycleCampaigns, amplificationTargets] =
    cycleIds.length === 0
      ? [[], [], []]
      : await Promise.all([
          db
            .select({
              id: campaignTable.id,
              name: campaignTable.name,
              status: campaignTable.status,
              budget: campaignTable.budget,
              performanceCycleId: campaignTable.performanceCycleId,
            })
            .from(campaignTable)
            .where(inArray(campaignTable.performanceCycleId, cycleIds)),
          db
            .select({
              id: lifecycleCampaignTable.id,
              name: lifecycleCampaignTable.name,
              runState: lifecycleCampaignTable.runState,
              performanceCycleId: lifecycleCampaignTable.performanceCycleId,
            })
            .from(lifecycleCampaignTable)
            .where(
              inArray(lifecycleCampaignTable.performanceCycleId, cycleIds),
            ),
          db
            .select({
              id: amplificationTargetTable.id,
              ask: amplificationTargetTable.ask,
              actionKind: amplificationTargetTable.actionKind,
              performanceCycleId: amplificationTargetTable.performanceCycleId,
            })
            .from(amplificationTargetTable)
            .where(
              inArray(amplificationTargetTable.performanceCycleId, cycleIds),
            ),
        ]);

  // The ads themselves, so "is the right creative running" is answerable here
  // rather than only in Ads Manager.
  const campaignIds = campaigns.map((row) => row.id);
  const platformCampaigns =
    campaignIds.length === 0
      ? []
      : await db
          .select({
            id: platformCampaignTable.id,
            name: platformCampaignTable.name,
            status: platformCampaignTable.status,
            platform: platformCampaignTable.platform,
            spend: platformCampaignTable.spend,
            stats: platformCampaignTable.stats,
            manageUrl: platformCampaignTable.manageUrl,
            heroThumbnailUrl: platformCampaignTable.heroThumbnailUrl,
            campaignId: platformCampaignTable.campaignId,
          })
          .from(platformCampaignTable)
          .where(inArray(platformCampaignTable.campaignId, campaignIds));
  const platformCampaignIds = platformCampaigns.map((row) => row.id);
  const ads =
    platformCampaignIds.length === 0
      ? []
      : await db
          .select({
            id: platformAdTable.id,
            platformCampaignId: platformAdTable.platformCampaignId,
            name: platformAdTable.name,
            status: platformAdTable.status,
            adSetName: platformAdTable.adSetName,
            thumbnailUrl: platformAdTable.thumbnailUrl,
            media: platformAdTable.media,
            stats: platformAdTable.stats,
            externalId: platformAdTable.externalId,
            businessKey: platformAdTable.businessKey,
          })
          .from(platformAdTable)
          .where(
            inArray(platformAdTable.platformCampaignId, platformCampaignIds),
          );

  return {
    account,
    delivery: {
      campaigns,
      lifecycleCampaigns,
      amplificationTargets,
      platformCampaigns,
      ads,
    },
  };
}

export async function createPerformanceAccount(
  actor: PerformanceActor,
  input: z.infer<typeof createPerformanceAccountSchema>,
) {
  const [account] = await db
    .insert(performanceAccountTable)
    .values({ ...input, organizationId: actor.orgId })
    .returning();
  return { account: account! };
}

export async function updatePerformanceAccount(
  actor: PerformanceActor,
  input: z.infer<typeof updatePerformanceAccountSchema>,
) {
  await requireAccount(actor, input.accountId);
  const { accountId, ...changes } = input;
  const [account] = await db
    .update(performanceAccountTable)
    .set(changes)
    .where(eq(performanceAccountTable.id, accountId))
    .returning();
  return { account: account! };
}

export async function addPerformanceProperty(
  actor: PerformanceActor,
  input: z.infer<typeof addPerformancePropertySchema>,
) {
  await requireAccount(actor, input.accountId);
  const [property] = await db
    .insert(performancePropertyTable)
    .values(input)
    .returning();
  return { property: property! };
}

export async function updatePerformanceProperty(
  actor: PerformanceActor,
  input: z.infer<typeof updatePerformancePropertySchema>,
) {
  const existing = await db.query.performancePropertyTable.findFirst({
    where: eq(performancePropertyTable.id, input.propertyId),
  });
  if (!existing) {
    throw new PerformanceError(
      "NOT_FOUND",
      `Property not found: ${input.propertyId}`,
    );
  }
  await requireAccount(actor, existing.accountId);
  const [property] = await db
    .update(performancePropertyTable)
    .set({
      ...(input.monolithPropertyId !== undefined
        ? { propertyId: input.monolithPropertyId }
        : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    })
    .where(eq(performancePropertyTable.id, input.propertyId))
    .returning();
  return { property: property! };
}

export async function openPerformanceCycle(
  actor: PerformanceActor,
  input: z.infer<typeof openPerformanceCycleSchema>,
) {
  const account = await requireAccount(actor, input.accountId);
  const [cycle] = await db
    .insert(performanceCycleTable)
    .values({
      ...input,
      startAt: input.startAt ? new Date(input.startAt) : null,
      endAt: input.endAt ? new Date(input.endAt) : null,
    })
    .returning();
  return { cycle: cycle! };
}

export async function updatePerformanceCycle(
  actor: PerformanceActor,
  input: z.infer<typeof updatePerformanceCycleSchema>,
) {
  const currentCycle = await requireCycle(actor, input.cycleId);
  const account = await requireAccount(actor, currentCycle.accountId);
  const { cycleId, startAt, endAt, ...changes } = input;
  const [cycle] = await db
    .update(performanceCycleTable)
    .set({
      ...changes,
      ...(startAt !== undefined
        ? { startAt: startAt ? new Date(startAt) : null }
        : {}),
      ...(endAt !== undefined ? { endAt: endAt ? new Date(endAt) : null } : {}),
    })
    .where(eq(performanceCycleTable.id, cycleId))
    .returning();
  return { cycle: cycle! };
}

/**
 * Attach one delivery row (campaign, lifecycle campaign, or amplification
 * target) to a cycle, or detach with cycleId null. The write targets tables
 * without org scoping of their own, so the cycle's account is the boundary
 * checked here; a detach revalidates via the row's current cycle.
 */
/**
 * Campaigns that could be attached to a cycle: platform campaigns that either
 * have no campaign at all (the shape every synced campaign arrives in) or
 * whose campaign is not already on a cycle. Ordered by platform start date,
 * because sync stamps `createdAt` with the ingest time and that sorts useless.
 */
export async function searchAttachableCampaigns(
  actor: PerformanceActor,
  input: z.infer<typeof searchAttachableCampaignsSchema>,
) {
  const rows = await db
    .select({
      id: platformCampaignTable.id,
      name: platformCampaignTable.name,
      platform: platformCampaignTable.platform,
      status: platformCampaignTable.status,
      spend: platformCampaignTable.spend,
      stats: platformCampaignTable.stats,
      startAt: platformCampaignTable.startAt,
      externalId: platformCampaignTable.externalId,
      heroThumbnailUrl: platformCampaignTable.heroThumbnailUrl,
      campaignId: platformCampaignTable.campaignId,
      campaignCycleId: campaignTable.performanceCycleId,
    })
    .from(platformCampaignTable)
    .leftJoin(
      campaignTable,
      eq(campaignTable.id, platformCampaignTable.campaignId),
    )
    .where(
      and(
        isNull(campaignTable.performanceCycleId),
        input.query
          ? ilike(platformCampaignTable.name, `%${input.query}%`)
          : undefined,
        input.platform
          ? eq(platformCampaignTable.platform, input.platform as "meta_ads")
          : undefined,
      ),
    )
    .orderBy(desc(platformCampaignTable.startAt))
    .limit(input.limit);
  return { campaigns: rows };
}

/**
 * Sum observed spend for every campaign under the cycle's attached
 * campaigns, in cents.
 *
 * Reads `stats.spend` (unrounded) in preference to `campaign.spend`, which the
 * schema documents as a coarse whole-dollar rollup — $24.66 is stored there as
 * 25, and summing rounded dollars across a portfolio drifts against the media
 * budget in the customer's favour or ours, unpredictably.
 */
export async function recomputePerformanceCycleSpend(cycleId: string) {
  const campaigns = await db
    .select({
      spend: platformCampaignTable.spend,
      stats: platformCampaignTable.stats,
    })
    .from(platformCampaignTable)
    .innerJoin(
      campaignTable,
      eq(campaignTable.id, platformCampaignTable.campaignId),
    )
    .where(eq(campaignTable.performanceCycleId, cycleId));

  const cents = campaigns.reduce((total, row) => {
    const precise = row.stats?.spend;
    const dollars = typeof precise === "number" ? precise : (row.spend ?? 0);
    return total + Math.round(dollars * 100);
  }, 0);

  await db
    .update(performanceCycleTable)
    .set({ actualSpendCents: cents, actualSpendAt: new Date() })
    .where(eq(performanceCycleTable.id, cycleId));
  return { cycleId, actualSpendCents: cents, campaigns: campaigns.length };
}

/**
 * Refresh every cycle's observed spend. Called at the end of the Zernio ads
 * sync so it rides a compute wake the sync already paid for (see the cron
 * budget note in AGENTS.md) rather than adding a mark of its own.
 */
export async function recomputeAllPerformanceCycleSpend() {
  const cycles = await db
    .select({ id: performanceCycleTable.id })
    .from(performanceCycleTable);
  const results = [];
  for (const cycle of cycles) {
    results.push(await recomputePerformanceCycleSpend(cycle.id));
  }
  return { cycles: results.length, results };
}

/** Ownership-checked entry point for the capability and router surfaces. */
export async function refreshPerformanceCycleSpend(
  actor: PerformanceActor,
  cycleId: string,
) {
  await requireCycle(actor, cycleId);
  return recomputePerformanceCycleSpend(cycleId);
}

export async function attachToPerformanceCycle(
  actor: PerformanceActor,
  input: z.infer<typeof attachToPerformanceCycleSchema>,
) {
  if (input.cycleId) await requireCycle(actor, input.cycleId);

  // A platform campaign has no cycle FK of its own — it reaches a cycle through
  // its campaign. Synced campaigns have no campaign at all, so attaching
  // one mints a wrapper campaign for the cycle and reuses it thereafter.
  if (input.kind === "platformCampaign") {
    return attachCampaignToCycle(actor, input.cycleId, input.id);
  }

  const target = {
    campaign: {
      table: campaignTable,
      idColumn: campaignTable.id,
      cycleColumn: campaignTable.performanceCycleId,
    },
    lifecycleCampaign: {
      table: lifecycleCampaignTable,
      idColumn: lifecycleCampaignTable.id,
      cycleColumn: lifecycleCampaignTable.performanceCycleId,
    },
    amplificationTarget: {
      table: amplificationTargetTable,
      idColumn: amplificationTargetTable.id,
      cycleColumn: amplificationTargetTable.performanceCycleId,
    },
  }[input.kind];

  const existing = await db
    .select({ id: target.idColumn, cycleId: target.cycleColumn })
    .from(target.table)
    .where(eq(target.idColumn, input.id));
  const row = existing[0];
  if (!row) {
    throw new PerformanceError(
      "NOT_FOUND",
      `${input.kind} not found: ${input.id}`,
    );
  }
  if (!input.cycleId && row.cycleId) await requireCycle(actor, row.cycleId);

  await db
    .update(target.table)
    .set({ performanceCycleId: input.cycleId })
    .where(eq(target.idColumn, input.id));
  return {
    kind: input.kind,
    id: input.id,
    performanceCycleId: input.cycleId,
    previousCycleId: row.cycleId,
  };
}

/** Wrapper-campaign slug for a cycle, so repeated attaches reuse one row. */
const cycleWrapperSlug = (cycleId: string) => `perf-cycle-${cycleId}`;

async function attachCampaignToCycle(
  actor: PerformanceActor,
  cycleId: string | null,
  platformCampaignId: string,
) {
  const campaign = await db.query.platformCampaignTable.findFirst({
    where: eq(platformCampaignTable.id, platformCampaignId),
    columns: {
      id: true,
      name: true,
      brandId: true,
      platform: true,
      campaignId: true,
      budget: true,
      startAt: true,
      endAt: true,
    },
  });
  if (!campaign) {
    throw new PerformanceError(
      "NOT_FOUND",
      `Campaign not found: ${platformCampaignId}`,
    );
  }

  // Detach: clear the campaign's link to a cycle-owned wrapper. A campaign
  // whose campaign is a real strategic push is left alone — detaching must
  // not silently orphan Wander's own campaign from its campaign.
  if (!cycleId) {
    const current = campaign.campaignId
      ? await db.query.campaignTable.findFirst({
          where: eq(campaignTable.id, campaign.campaignId),
          columns: { id: true, slug: true, performanceCycleId: true },
        })
      : null;
    if (current?.performanceCycleId) {
      await requireCycle(actor, current.performanceCycleId);
      const isWrapper =
        current.slug === cycleWrapperSlug(current.performanceCycleId);
      if (isWrapper) {
        await db
          .update(platformCampaignTable)
          .set({ campaignId: null })
          .where(eq(platformCampaignTable.id, platformCampaignId));
        // A wrapper exists only to carry campaigns. Left on the cycle once its
        // last campaign detaches it renders as an empty delivery row, so it
        // comes off the cycle with the campaign it was minted for.
        const siblings = await db
          .select({ id: platformCampaignTable.id })
          .from(platformCampaignTable)
          .where(eq(platformCampaignTable.campaignId, current.id))
          .limit(1);
        if (siblings.length === 0) {
          await db
            .update(campaignTable)
            .set({ performanceCycleId: null, status: "archived" })
            .where(eq(campaignTable.id, current.id));
        }
      }
      await recomputePerformanceCycleSpend(current.performanceCycleId);
      return {
        kind: "platformCampaign" as const,
        id: platformCampaignId,
        performanceCycleId: null,
        detachedFromWrapper: isWrapper,
      };
    }
    return {
      kind: "platformCampaign" as const,
      id: platformCampaignId,
      performanceCycleId: null,
      detachedFromWrapper: false,
    };
  }

  const cycle = await requireCycle(actor, cycleId);

  // Already has a campaign: put that campaign on the cycle rather than
  // rewriting the campaign's parent, so an existing push keeps its grouping.
  if (campaign.campaignId) {
    await db
      .update(campaignTable)
      .set({ performanceCycleId: cycleId })
      .where(eq(campaignTable.id, campaign.campaignId));
    const spend = await recomputePerformanceCycleSpend(cycleId);
    return {
      kind: "platformCampaign" as const,
      id: platformCampaignId,
      performanceCycleId: cycleId,
      campaignId: campaign.campaignId,
      createdWrapper: false,
      actualSpendCents: spend.actualSpendCents,
    };
  }

  const slug = cycleWrapperSlug(cycleId);
  const existing = await db.query.campaignTable.findFirst({
    where: eq(campaignTable.slug, slug),
    columns: { id: true },
  });
  const wrapperId =
    existing?.id ??
    (
      await db
        .insert(campaignTable)
        .values({
          brandId: campaign.brandId,
          name: `Performance · ${cycle.period}`,
          slug,
          goal: "performance",
          description:
            "Wrapper campaign created by attaching a platform campaign to a performance cycle. Platform campaigns reach a cycle through a campaign; a hand-built one has none.",
          status: "active",
          performanceCycleId: cycleId,
          startAt: campaign.startAt,
          endAt: campaign.endAt,
        })
        .returning({ id: campaignTable.id })
    )[0]!.id;

  await db
    .update(campaignTable)
    .set({ performanceCycleId: cycleId })
    .where(eq(campaignTable.id, wrapperId));
  await db
    .update(platformCampaignTable)
    .set({ campaignId: wrapperId })
    .where(eq(platformCampaignTable.id, platformCampaignId));

  const spend = await recomputePerformanceCycleSpend(cycleId);
  return {
    kind: "platformCampaign" as const,
    id: platformCampaignId,
    performanceCycleId: cycleId,
    campaignId: wrapperId,
    createdWrapper: !existing,
    actualSpendCents: spend.actualSpendCents,
  };
}

// ---- SPONSORED ABANDONMENT (the BDR signal) --------------------------------

export const sponsoredAbandonmentSchema = z.object({
  accountId: z
    .string()
    .min(1)
    .optional()
    .describe("Scope to one customer; omit for every sponsored home."),
  sinceHours: z.number().int().min(1).max(720).default(168),
  stage: z
    .enum(["checkout", "wishlist", "any"])
    .default("checkout")
    .describe("Checkout is the abandoned-cart signal BDRs asked for."),
  includeConverted: z
    .boolean()
    .default(false)
    .describe("Include users who went on to purchase after abandoning."),
  limit: z.number().int().min(1).max(200).default(50),
});

/**
 * Guests who abandoned on a sponsored property.
 *
 * Joined on the listing id (`funnel_state.lastCheckoutPropertyId` =
 * `performance_property.propertyId`), which is the value the tracked event
 * already carries in `products[0].product_id` and the same id the Meta catalog
 * uses as its retailer_id. Deliberately not matched on property name: the
 * Amplitude display name and the catalog name differ, and a name match would
 * silently attribute one customer's abandonment to another.
 *
 * A property with no `propertyId` yet cannot match, so it is reported
 * separately rather than counted as zero abandonment.
 */
export async function listSponsoredAbandonment(
  actor: PerformanceActor,
  input: z.infer<typeof sponsoredAbandonmentSchema>,
) {
  if (input.accountId) await requireAccount(actor, input.accountId);
  const since = new Date(Date.now() - input.sinceHours * 60 * 60 * 1000);

  const properties = await db
    .select({
      propertyRowId: performancePropertyTable.id,
      propertyId: performancePropertyTable.propertyId,
      title: performancePropertyTable.title,
      wanderUrl: performancePropertyTable.wanderUrl,
      accountId: performanceAccountTable.id,
      accountName: performanceAccountTable.name,
      contactName: performanceAccountTable.contactName,
    })
    .from(performancePropertyTable)
    .innerJoin(
      performanceAccountTable,
      eq(performanceAccountTable.id, performancePropertyTable.accountId),
    )
    .where(
      and(
        eq(performanceAccountTable.organizationId, actor.orgId),
        isNull(performanceAccountTable.deletedAt),
        isNull(performancePropertyTable.deletedAt),
        input.accountId
          ? eq(performancePropertyTable.accountId, input.accountId)
          : undefined,
      ),
    );

  const unresolved = properties.filter((row) => !row.propertyId);
  const byPropertyId = new Map(
    properties
      .filter((row) => row.propertyId)
      .map((row) => [row.propertyId!, row]),
  );
  const ids = [...byPropertyId.keys()];
  if (ids.length === 0) {
    return {
      events: [],
      unresolvedProperties: unresolved,
      matchedProperties: 0,
    };
  }

  const stageColumn =
    input.stage === "wishlist"
      ? funnelStateTable.lastWishlistPropertyId
      : funnelStateTable.lastCheckoutPropertyId;
  const stageTs =
    input.stage === "wishlist"
      ? funnelStateTable.lastWishlistTs
      : funnelStateTable.lastCheckoutTs;

  const rows = await db
    .select({
      userId: funnelStateTable.userId,
      email: funnelStateTable.email,
      checkoutPropertyId: funnelStateTable.lastCheckoutPropertyId,
      wishlistPropertyId: funnelStateTable.lastWishlistPropertyId,
      propertyName: funnelStateTable.lastCheckoutProperty,
      checkin: funnelStateTable.lastCheckoutCheckin,
      checkout: funnelStateTable.lastCheckoutCheckout,
      value: funnelStateTable.lastCheckoutValue,
      checkoutTs: funnelStateTable.lastCheckoutTs,
      wishlistTs: funnelStateTable.lastWishlistTs,
      paymentTs: funnelStateTable.lastPaymentTs,
      paymentSubmitTs: funnelStateTable.lastPaymentSubmitTs,
      purchaseTs: funnelStateTable.lastPurchaseTs,
    })
    .from(funnelStateTable)
    .where(
      and(
        inArray(stageColumn, ids),
        gte(stageTs, since),
        input.includeConverted
          ? undefined
          : isNull(funnelStateTable.lastPurchaseTs),
      ),
    )
    .orderBy(desc(stageTs))
    .limit(input.limit);

  const events = rows.map((row) => {
    const matchId =
      input.stage === "wishlist"
        ? row.wishlistPropertyId
        : row.checkoutPropertyId;
    const property = matchId ? byPropertyId.get(matchId) : undefined;
    // Payment submitted with no purchase is the hottest state there is: the
    // guest tried to pay and something stopped them.
    const heat = row.purchaseTs
      ? "converted"
      : row.paymentSubmitTs
        ? "payment_failed"
        : row.paymentTs
          ? "payment_entered"
          : "checkout_abandoned";
    return {
      userId: row.userId,
      email: row.email,
      heat,
      abandonedAt: input.stage === "wishlist" ? row.wishlistTs : row.checkoutTs,
      propertyName: row.propertyName,
      checkin: row.checkin,
      checkout: row.checkout,
      value: row.value,
      account: property
        ? {
            id: property.accountId,
            name: property.accountName,
            contactName: property.contactName,
          }
        : null,
      property: property
        ? { title: property.title, wanderUrl: property.wanderUrl }
        : null,
    };
  });

  return {
    events,
    unresolvedProperties: unresolved,
    matchedProperties: ids.length,
  };
}
