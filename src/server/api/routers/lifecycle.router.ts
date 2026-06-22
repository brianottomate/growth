import { z } from "zod";
import { and, asc, eq, inArray, isNull, max } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  brandTable,
  lifecycleCampaignTable,
  lifecycleKindEnum,
  lifecycleProgramPriorityEnum,
  lifecycleProgramStatusEnum,
  lifecycleProgramStepTable,
  lifecycleProgramTable,
  lifecycleStepStatusEnum,
  lifecycleStepSystemEnum,
  lifecycleWorkspaceEnum,
  memberTable,
  touchpointChannelEnum,
} from "@/server/db/schema";
import type { LifecycleStepStatus } from "@/server/db/schema";

type Ctx = {
  db: typeof import("@/server/db").db;
  session: { user: { id: string } };
};

async function getOrgId(ctx: Ctx) {
  const membership = await ctx.db.query.memberTable.findFirst({
    where: eq(memberTable.userId, ctx.session.user.id),
  });
  if (!membership?.organizationId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No organization" });
  }
  return membership.organizationId;
}

async function orgBrandIds(ctx: Ctx, orgId: string) {
  const brands = await ctx.db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true },
  });
  return brands.map((b) => b.id);
}

async function assertBrandAccess(ctx: Ctx, brandId: string) {
  const brand = await ctx.db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
  });
  if (!brand?.organizationId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
  }
  const membership = await ctx.db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.userId, ctx.session.user.id),
      eq(memberTable.organizationId, brand.organizationId),
    ),
  });
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No access to brand" });
  }
}

/** Load a step's program and assert access; returns the program's brandId. */
async function assertStepAccess(ctx: Ctx, programId: string) {
  const program = await ctx.db.query.lifecycleProgramTable.findFirst({
    where: eq(lifecycleProgramTable.id, programId),
  });
  if (!program) throw new TRPCError({ code: "NOT_FOUND" });
  await assertBrandAccess(ctx, program.brandId);
  return program;
}

export type LifecycleCoverage = "covered" | "partial" | "gap";

/**
 * Coverage of the *plan*, rolled up from the operator-set step statuses and the
 * touchpoint target: gap (nothing real), covered (all live & target met),
 * partial (anything in between — some planned/missing, or below target).
 */
function coverageOf(
  steps: { status: LifecycleStepStatus }[],
  target: number | null,
): LifecycleCoverage {
  if (steps.length === 0) return "gap";
  if (steps.every((s) => s.status === "missing")) return "gap";
  const allActive = steps.every((s) => s.status === "active");
  const targetMet = target == null || steps.length >= target;
  if (allActive && targetMet) return "covered";
  return "partial";
}

const kindSchema = z.enum(lifecycleKindEnum.enumValues);
const statusSchema = z.enum(lifecycleProgramStatusEnum.enumValues);
const prioritySchema = z.enum(lifecycleProgramPriorityEnum.enumValues);
const channelSchema = z.enum(touchpointChannelEnum.enumValues);

const workspaceSchema = z.enum(lifecycleWorkspaceEnum.enumValues);

const programInput = {
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  kind: kindSchema.optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  workspace: workspaceSchema.optional(),
  intendedTrigger: z.string().max(200).nullish(),
  intendedChannels: z.array(channelSchema).optional(),
  targetTouchpoints: z.number().int().min(0).max(50).nullish(),
};

const stepStatusSchema = z.enum(lifecycleStepStatusEnum.enumValues);
const stepSystemSchema = z.enum(lifecycleStepSystemEnum.enumValues);

const stepFields = {
  name: z.string().min(1).max(200),
  channel: channelSchema.optional(),
  status: stepStatusSchema.optional(),
  system: stepSystemSchema.nullish(),
  delayMinutes: z.number().int().min(0).max(525600).nullish(), // ≤ 1 year
  delayLabel: z.string().max(100).nullish(),
  subject: z.string().max(500).nullish(),
  body: z.string().max(20000).nullish(),
  url: z.string().max(2000).nullish(),
  campaignId: z.string().nullish(),
  parentStepId: z.string().nullish(),
  branchLabel: z.string().max(200).nullish(),
};

/** A branch parent must be another step of the same program (and not self). */
async function assertValidParent(
  ctx: Ctx,
  programId: string,
  parentStepId: string | null | undefined,
  selfId?: string,
) {
  if (!parentStepId) return;
  if (selfId && parentStepId === selfId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A step cannot branch from itself",
    });
  }
  const parent = await ctx.db.query.lifecycleProgramStepTable.findFirst({
    where: eq(lifecycleProgramStepTable.id, parentStepId),
    columns: { id: true, programId: true },
  });
  if (parent?.programId !== programId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Branch parent must be a step of the same program",
    });
  }
}

export const lifecycleRouter = createTRPCRouter({
  /**
   * The strategy view: programs (intent) with their authored steps and a
   * coverage status, plus the brand's mirrored CIO campaigns so steps can
   * optionally be tagged with the campaign that delivers them.
   */
  overview: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx);
    const brandIds = await orgBrandIds(ctx, orgId);
    if (brandIds.length === 0) return { programs: [], campaigns: [] };

    const [programs, campaigns] = await Promise.all([
      ctx.db.query.lifecycleProgramTable.findMany({
        where: and(
          inArray(lifecycleProgramTable.brandId, brandIds),
          isNull(lifecycleProgramTable.deletedAt),
        ),
        with: {
          steps: {
            // Absolute timeline: earliest offset first, position breaks ties.
            // NULL delays sort last (Postgres ASC default).
            orderBy: [
              asc(lifecycleProgramStepTable.delayMinutes),
              asc(lifecycleProgramStepTable.position),
            ],
            with: {
              campaign: { columns: { id: true, name: true, runState: true } },
            },
          },
        },
      }),
      ctx.db.query.lifecycleCampaignTable.findMany({
        where: and(
          inArray(lifecycleCampaignTable.brandId, brandIds),
          isNull(lifecycleCampaignTable.deletedAt),
        ),
        columns: { id: true, name: true, runState: true, brandId: true },
      }),
    ]);

    return {
      programs: programs.map((p) => ({
        ...p,
        coverage: coverageOf(p.steps, p.targetTouchpoints),
      })),
      campaigns: campaigns.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }),

  createProgram: protectedProcedure
    .input(z.object({ brandId: z.string(), ...programInput }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      const { brandId, ...rest } = input;
      const [program] = await ctx.db
        .insert(lifecycleProgramTable)
        .values({ brandId, ...rest })
        .returning();
      return program;
    }),

  updateProgram: protectedProcedure
    .input(
      z.object({ id: z.string(), ...programInput }).partial({ name: true }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const existing = await ctx.db.query.lifecycleProgramTable.findFirst({
        where: eq(lifecycleProgramTable.id, id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await assertBrandAccess(ctx, existing.brandId);
      const [updated] = await ctx.db
        .update(lifecycleProgramTable)
        .set(rest)
        .where(eq(lifecycleProgramTable.id, id))
        .returning();
      return updated;
    }),

  deleteProgram: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.lifecycleProgramTable.findFirst({
        where: eq(lifecycleProgramTable.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await assertBrandAccess(ctx, existing.brandId);
      await ctx.db
        .update(lifecycleProgramTable)
        .set({ deletedAt: new Date() })
        .where(eq(lifecycleProgramTable.id, input.id));
      return { id: input.id };
    }),

  // ---- steps (the authored touchpoints of a program) ----

  addStep: protectedProcedure
    .input(z.object({ programId: z.string(), ...stepFields }))
    .mutation(async ({ ctx, input }) => {
      await assertStepAccess(ctx, input.programId);
      await assertValidParent(ctx, input.programId, input.parentStepId);
      const { programId, ...rest } = input;
      const [{ value: maxPos } = { value: null }] = await ctx.db
        .select({ value: max(lifecycleProgramStepTable.position) })
        .from(lifecycleProgramStepTable)
        .where(eq(lifecycleProgramStepTable.programId, programId));
      const [step] = await ctx.db
        .insert(lifecycleProgramStepTable)
        .values({ programId, position: (maxPos ?? -1) + 1, ...rest })
        .returning();
      return step;
    }),

  updateStep: protectedProcedure
    .input(
      z
        .object({
          id: z.string(),
          position: z.number().int().optional(),
          ...stepFields,
        })
        .partial({
          name: true,
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const step = await ctx.db.query.lifecycleProgramStepTable.findFirst({
        where: eq(lifecycleProgramStepTable.id, id),
      });
      if (!step) throw new TRPCError({ code: "NOT_FOUND" });
      await assertStepAccess(ctx, step.programId);
      await assertValidParent(ctx, step.programId, rest.parentStepId, id);
      const [updated] = await ctx.db
        .update(lifecycleProgramStepTable)
        .set(rest)
        .where(eq(lifecycleProgramStepTable.id, id))
        .returning();
      return updated;
    }),

  deleteStep: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const step = await ctx.db.query.lifecycleProgramStepTable.findFirst({
        where: eq(lifecycleProgramStepTable.id, input.id),
      });
      if (!step) throw new TRPCError({ code: "NOT_FOUND" });
      await assertStepAccess(ctx, step.programId);
      await ctx.db
        .delete(lifecycleProgramStepTable)
        .where(eq(lifecycleProgramStepTable.id, input.id));
      return { id: input.id };
    }),
});
