import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import { syncZernioAds } from "@/server/services/ads-sync.service";

import {
  addPerformanceProperty,
  addPerformancePropertySchema,
  createPerformanceAccount,
  createPerformanceAccountSchema,
  getPerformanceAccount,
  listPerformanceAccounts,
  attachToPerformanceCycle,
  attachToPerformanceCycleSchema,
  openPerformanceCycle,
  openPerformanceCycleSchema,
  listSponsoredAbandonment,
  refreshPerformanceCycleSpend,
  sponsoredAbandonmentSchema,
  searchAttachableCampaigns,
  searchAttachableCampaignsSchema,
  updatePerformanceAccount,
  updatePerformanceAccountSchema,
  updatePerformanceCycle,
  updatePerformanceCycleSchema,
  updatePerformanceProperty,
  updatePerformancePropertySchema,
} from "@/server/services/performance.service";
import {
  applyPerformanceIntake,
  listPerformanceIntakes,
  previewIntakeApply,
  setIntakeVerifiedPage,
  verifyIntakeAccess,
} from "@/server/services/performance-intake.service";

import { protectedProcedure } from "../trpc";

// Performance+ (/app/performance) — the customers paying for sponsored
// placement on Wander's surfaces. Replaces the "Performance Dashboard" sheet.
// Delivery itself stays in campaign / lifecycle / amplification; this is the
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

  attachableCampaigns: protectedProcedure
    .input(searchAttachableCampaignsSchema)
    .query(async ({ ctx, input }) =>
      searchAttachableCampaigns(await actorFor(ctx), input),
    ),

  attach: protectedProcedure
    .input(attachToPerformanceCycleSchema)
    .mutation(async ({ ctx, input }) =>
      attachToPerformanceCycle(await actorFor(ctx), input),
    ),

  sponsoredAbandonment: protectedProcedure
    .input(sponsoredAbandonmentSchema)
    .query(async ({ ctx, input }) =>
      listSponsoredAbandonment(await actorFor(ctx), input),
    ),

  syncCampaigns: protectedProcedure
    .input(
      z.object({
        brandSlug: z.string().trim().min(1).default("wander"),
        sinceDays: z.number().int().min(1).max(1_095).nullable().optional(),
        minSpend: z.number().min(0).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await actorFor(ctx);
      return syncZernioAds({ ...input, platform: "meta_ads" });
    }),

  refreshSpend: protectedProcedure
    .input(z.object({ cycleId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      refreshPerformanceCycleSpend(await actorFor(ctx), input.cycleId),
    ),

  // ---- intake -------------------------------------------------------------

  intakes: protectedProcedure
    .input(z.object({ accountId: z.string().min(1) }))
    .query(async ({ ctx, input }) =>
      listPerformanceIntakes(await actorFor(ctx), input.accountId),
    ),

  previewIntake: protectedProcedure
    .input(z.object({ intakeId: z.string().min(1) }))
    .query(async ({ ctx, input }) =>
      previewIntakeApply(await actorFor(ctx), input.intakeId),
    ),

  applyIntake: protectedProcedure
    .input(
      z.object({
        intakeId: z.string().min(1),
        // The operator's number wins: a client who asked us to recommend one
        // has no budget to promote, and apply must not invent it.
        mediaBudgetDollars: z.number().int().min(0).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      applyPerformanceIntake(await actorFor(ctx), input),
    ),

  // Read-only against Zernio: asks whether the Leadsie grant landed and
  // records the Page when exactly one name matches.
  verifyIntakeAccess: protectedProcedure
    .input(z.object({ intakeId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      verifyIntakeAccess(await actorFor(ctx), input.intakeId),
    ),

  setIntakeVerifiedPage: protectedProcedure
    .input(
      z.object({ intakeId: z.string().min(1), pageId: z.string().min(1) }),
    )
    .mutation(async ({ ctx, input }) =>
      setIntakeVerifiedPage(await actorFor(ctx), input),
    ),
} satisfies TRPCRouterRecord;
