import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/server/db";
import { memberTable } from "@/server/db/schema";

import {
  addPerformanceProperty,
  addPerformancePropertySchema,
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
} from "@/server/services/performance.service";

import { protectedProcedure } from "../trpc";

// Performance+ (/app/performance) — the customers paying for sponsored
// placement on Wander's surfaces. Replaces the "Performance Dashboard" sheet.
// Delivery itself stays in initiative / lifecycle / amplification; this is the
// commercial layer plus a read of what is attached to each cycle.

type PerformanceContext = {
  db: Database;
  session: {
    user: { id: string };
    session: { activeOrganizationId?: string | null };
  };
};

// Membership is re-checked against the database rather than trusted from the
// session claim, matching ads.router and the MCP route.
async function actorFor(ctx: PerformanceContext) {
  const active = ctx.session.session.activeOrganizationId;
  const membership = await ctx.db.query.memberTable.findFirst({
    where: active
      ? and(
          eq(memberTable.userId, ctx.session.user.id),
          eq(memberTable.organizationId, active),
        )
      : eq(memberTable.userId, ctx.session.user.id),
    columns: { organizationId: true },
  });
  if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
  return { orgId: membership.organizationId };
}

export const performanceRouter = {
  list: protectedProcedure.query(async ({ ctx }) =>
    listPerformanceAccounts(await actorFor(ctx)),
  ),

  get: protectedProcedure
    .input(z.object({ accountId: z.string().min(1) }))
    .query(async ({ ctx, input }) =>
      getPerformanceAccount(await actorFor(ctx), input.accountId),
    ),

  createAccount: protectedProcedure
    .input(createPerformanceAccountSchema)
    .mutation(async ({ ctx, input }) =>
      createPerformanceAccount(await actorFor(ctx), input),
    ),

  updateAccount: protectedProcedure
    .input(updatePerformanceAccountSchema)
    .mutation(async ({ ctx, input }) =>
      updatePerformanceAccount(await actorFor(ctx), input),
    ),

  addProperty: protectedProcedure
    .input(addPerformancePropertySchema)
    .mutation(async ({ ctx, input }) =>
      addPerformanceProperty(await actorFor(ctx), input),
    ),

  updateProperty: protectedProcedure
    .input(updatePerformancePropertySchema)
    .mutation(async ({ ctx, input }) =>
      updatePerformanceProperty(await actorFor(ctx), input),
    ),

  openCycle: protectedProcedure
    .input(openPerformanceCycleSchema)
    .mutation(async ({ ctx, input }) =>
      openPerformanceCycle(await actorFor(ctx), input),
    ),

  updateCycle: protectedProcedure
    .input(updatePerformanceCycleSchema)
    .mutation(async ({ ctx, input }) =>
      updatePerformanceCycle(await actorFor(ctx), input),
    ),
} satisfies TRPCRouterRecord;
