import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  audienceTable,
  audienceTargetPriorityEnum,
  audienceTargetStatusEnum,
  audienceTargetTable,
  audienceTypeEnum,
  brandTable,
  channelPlatformEnum,
  memberTable,
} from "@/server/db/schema";

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

export type AudienceCoverage = "covered" | "partial" | "gap";

const typeSchema = z.enum(audienceTypeEnum.enumValues);
const statusSchema = z.enum(audienceTargetStatusEnum.enumValues);
const prioritySchema = z.enum(audienceTargetPriorityEnum.enumValues);
const platformSchema = z.enum(channelPlatformEnum.enumValues);

const targetInput = {
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: typeSchema.optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  intendedChannels: z.array(platformSchema).optional(),
  sizeGoalLabel: z.string().max(100).nullish(),
};

export const audienceRouter = createTRPCRouter({
  /**
   * Strategy view: targets (intended "who") with the per-channel audiences
   * that fulfil them and a coverage status against `intendedChannels`, plus
   * mirrored audiences not yet mapped to any target.
   */
  overview: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx);
    const brandIds = await orgBrandIds(ctx, orgId);
    if (brandIds.length === 0) return { targets: [], unmapped: [] };

    const [targets, audiences] = await Promise.all([
      ctx.db.query.audienceTargetTable.findMany({
        where: and(
          inArray(audienceTargetTable.brandId, brandIds),
          isNull(audienceTargetTable.deletedAt),
        ),
      }),
      ctx.db.query.audienceTable.findMany({
        where: inArray(audienceTable.brandId, brandIds),
        with: { channel: { columns: { platform: true, name: true } } },
      }),
    ]);

    const byTarget = new Map<string, typeof audiences>();
    const unmapped: typeof audiences = [];
    for (const a of audiences) {
      if (a.targetId) {
        const list = byTarget.get(a.targetId) ?? [];
        list.push(a);
        byTarget.set(a.targetId, list);
      } else {
        unmapped.push(a);
      }
    }

    return {
      targets: targets.map((t) => {
        const linked = byTarget.get(t.id) ?? [];
        const present = new Set<string>(
          linked.map((a) => a.channel?.platform ?? ""),
        );
        const intended = t.intendedChannels ?? [];
        const missing = intended.filter((p) => !present.has(p));
        let coverage: AudienceCoverage;
        if (intended.length === 0) {
          coverage = linked.length > 0 ? "covered" : "gap";
        } else if (missing.length === 0) {
          coverage = "covered";
        } else if (present.size > 0) {
          coverage = "partial";
        } else {
          coverage = "gap";
        }
        return { ...t, audiences: linked, coverage, missingChannels: missing };
      }),
      unmapped: unmapped.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }),

  createTarget: protectedProcedure
    .input(z.object({ brandId: z.string(), ...targetInput }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      const { brandId, type, ...rest } = input;
      const [target] = await ctx.db
        .insert(audienceTargetTable)
        .values({ brandId, type: type ?? "segment", ...rest })
        .returning();
      return target;
    }),

  updateTarget: protectedProcedure
    .input(z.object({ id: z.string(), ...targetInput }).partial({ name: true }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const existing = await ctx.db.query.audienceTargetTable.findFirst({
        where: eq(audienceTargetTable.id, id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await assertBrandAccess(ctx, existing.brandId);
      const [updated] = await ctx.db
        .update(audienceTargetTable)
        .set(rest)
        .where(eq(audienceTargetTable.id, id))
        .returning();
      return updated;
    }),

  deleteTarget: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.audienceTargetTable.findFirst({
        where: eq(audienceTargetTable.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await assertBrandAccess(ctx, existing.brandId);
      await ctx.db
        .update(audienceTable)
        .set({ targetId: null })
        .where(eq(audienceTable.targetId, input.id));
      await ctx.db
        .update(audienceTargetTable)
        .set({ deletedAt: new Date() })
        .where(eq(audienceTargetTable.id, input.id));
      return { id: input.id };
    }),

  linkAudience: protectedProcedure
    .input(
      z.object({ audienceId: z.string(), targetId: z.string().nullable() }),
    )
    .mutation(async ({ ctx, input }) => {
      const audience = await ctx.db.query.audienceTable.findFirst({
        where: eq(audienceTable.id, input.audienceId),
      });
      if (!audience) throw new TRPCError({ code: "NOT_FOUND" });
      await assertBrandAccess(ctx, audience.brandId);

      if (input.targetId) {
        const target = await ctx.db.query.audienceTargetTable.findFirst({
          where: eq(audienceTargetTable.id, input.targetId),
        });
        if (target?.brandId !== audience.brandId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Target must belong to the same brand",
          });
        }
      }

      const [updated] = await ctx.db
        .update(audienceTable)
        .set({ targetId: input.targetId })
        .where(eq(audienceTable.id, input.audienceId))
        .returning();
      return updated;
    }),
});
