import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { lifecycleProgramStepTable } from "@/server/db/schema";
import {
  addLifecycleStep,
  createLifecycleProgram,
  getLifecycleOverview,
  lifecycleCampaignSearchSchema,
  lifecycleCleanupStatusSchema,
  lifecycleProgramChangesSchema,
  lifecycleProgramCreateSchema,
  lifecycleStepChangesSchema,
  lifecycleStepCreateSchema,
  linkLifecycleCampaign,
  resolveLifecycleOrganizationId,
  searchLifecycleCampaigns,
  setLifecycleCampaignCleanupStatus,
  setLifecycleProgramArchived,
  updateLifecycleProgram,
  updateLifecycleStep,
} from "@/server/services/lifecycle.service";

type ProtectedContext = {
  session: {
    user: { id: string };
    session: { activeOrganizationId?: string | null };
  };
};

const organizationIdFor = (ctx: ProtectedContext) =>
  resolveLifecycleOrganizationId({
    userId: ctx.session.user.id,
    preferredOrganizationId: ctx.session.session.activeOrganizationId,
  });

export const lifecycleRouter = createTRPCRouter({
  overview: protectedProcedure.query(async ({ ctx }) =>
    getLifecycleOverview({
      organizationId: await organizationIdFor(ctx),
      includeCampaigns: true,
    }),
  ),

  searchCampaigns: protectedProcedure
    .input(lifecycleCampaignSearchSchema)
    .query(async ({ ctx, input }) =>
      searchLifecycleCampaigns({
        organizationId: await organizationIdFor(ctx),
        filters: input,
      }),
    ),

  createProgram: protectedProcedure
    .input(lifecycleProgramCreateSchema)
    .mutation(async ({ ctx, input }) =>
      createLifecycleProgram({
        organizationId: await organizationIdFor(ctx),
        program: input,
      }),
    ),

  updateProgram: protectedProcedure
    .input(
      lifecycleProgramChangesSchema.extend({
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      return updateLifecycleProgram({
        organizationId: await organizationIdFor(ctx),
        programId: id,
        changes,
      });
    }),

  deleteProgram: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) =>
      setLifecycleProgramArchived({
        organizationId: await organizationIdFor(ctx),
        programId: input.id,
        archived: true,
      }),
    ),

  addStep: protectedProcedure
    .input(lifecycleStepCreateSchema)
    .mutation(async ({ ctx, input }) =>
      addLifecycleStep({
        organizationId: await organizationIdFor(ctx),
        step: input,
      }),
    ),

  updateStep: protectedProcedure
    .input(
      lifecycleStepChangesSchema.extend({
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      return updateLifecycleStep({
        organizationId: await organizationIdFor(ctx),
        stepId: id,
        changes,
      });
    }),

  // Kept for the precise form UI. General chat intentionally has no hard
  // delete action; it can archive programs and edit steps instead.
  deleteStep: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const organizationId = await organizationIdFor(ctx);
      const existing = await ctx.db.query.lifecycleProgramStepTable.findFirst({
        where: eq(lifecycleProgramStepTable.id, input.id),
        columns: { id: true, programId: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Step not found" });
      }
      await updateLifecycleStep({
        organizationId,
        stepId: existing.id,
        changes: {},
      });
      await ctx.db
        .delete(lifecycleProgramStepTable)
        .where(eq(lifecycleProgramStepTable.id, existing.id));
      return { id: existing.id };
    }),

  linkCampaign: protectedProcedure
    .input(
      z.object({ campaignId: z.string(), programId: z.string().nullable() }),
    )
    .mutation(async ({ ctx, input }) =>
      linkLifecycleCampaign({
        organizationId: await organizationIdFor(ctx),
        ...input,
      }),
    ),

  setCleanupStatus: protectedProcedure
    .input(
      z.object({
        campaignId: z.string(),
        cleanupStatus: lifecycleCleanupStatusSchema,
      }),
    )
    .mutation(async ({ ctx, input }) =>
      setLifecycleCampaignCleanupStatus({
        organizationId: await organizationIdFor(ctx),
        ...input,
      }),
    ),
});
