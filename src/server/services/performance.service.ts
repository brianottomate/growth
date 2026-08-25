import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import {
  amplificationTargetTable,
  initiativeTable,
  lifecycleCampaignTable,
  performanceAccountTable,
  performanceCycleTable,
  performancePropertyTable,
  performanceReportTable,
} from "@/server/db/schema";

// Performance accounts — property managers paying to be featured on Wander's
// marketing surfaces. Commercial layer only: delivery stays in the existing
// initiative / lifecycle / amplification tables and attaches to a cycle via
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
  kind: z.enum(["initiative", "lifecycleCampaign", "amplificationTarget"]),
  id: z.string().min(1).describe("The delivery row being attached."),
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
        limit: 3,
        columns: {
          id: true,
          period: true,
          status: true,
          billedAmount: true,
          mediaBudget: true,
        },
      },
    },
  });
  return { accounts };
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
  const [initiatives, lifecycleCampaigns, amplificationTargets] =
    cycleIds.length === 0
      ? [[], [], []]
      : await Promise.all([
          db
            .select({
              id: initiativeTable.id,
              name: initiativeTable.name,
              status: initiativeTable.status,
              budget: initiativeTable.budget,
              performanceCycleId: initiativeTable.performanceCycleId,
            })
            .from(initiativeTable)
            .where(inArray(initiativeTable.performanceCycleId, cycleIds)),
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
              performanceCycleId:
                amplificationTargetTable.performanceCycleId,
            })
            .from(amplificationTargetTable)
            .where(
              inArray(amplificationTargetTable.performanceCycleId, cycleIds),
            ),
        ]);

  return { account, delivery: { initiatives, lifecycleCampaigns, amplificationTargets } };
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
  await requireAccount(actor, input.accountId);
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
  await requireCycle(actor, input.cycleId);
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
 * Attach one delivery row (initiative, lifecycle campaign, or amplification
 * target) to a cycle, or detach with cycleId null. The write targets tables
 * without org scoping of their own, so the cycle's account is the boundary
 * checked here; a detach revalidates via the row's current cycle.
 */
export async function attachToPerformanceCycle(
  actor: PerformanceActor,
  input: z.infer<typeof attachToPerformanceCycleSchema>,
) {
  if (input.cycleId) await requireCycle(actor, input.cycleId);

  const target = {
    initiative: {
      table: initiativeTable,
      idColumn: initiativeTable.id,
      cycleColumn: initiativeTable.performanceCycleId,
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
