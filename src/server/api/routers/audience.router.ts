import { z } from "zod";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  audienceTable,
  audienceActivationTable,
  audienceEvidenceTable,
  audienceTargetPriorityEnum,
  audienceTargetStatusEnum,
  audienceTargetTable,
  audienceActivationStatusEnum,
  audienceTypeEnum,
  brandTable,
  channelPlatformEnum,
  memberTable,
} from "@/server/db/schema";
import {
  audienceActiveWindowSchema,
  audienceContextSchema,
  audienceActivationDemographicModeSchema,
  audienceActivationGeoModeSchema,
  audienceDemographicsSchema,
  audienceEvidenceInputSchema,
  audienceGeographySchema,
  audienceMarketSideSchema,
  audienceProfileScopeSchema,
  audienceResearchMaturitySchema,
  audienceSlug,
  audienceSourceSchema,
} from "@/lib/audience-model";
import { withTransaction } from "@/server/db";
import type { db as database } from "@/server/db";

type Ctx = {
  db: typeof database;
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
const activationStatusSchema = z.enum(audienceActivationStatusEnum.enumValues);

const targetInput = {
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: typeSchema.optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  intendedChannels: z.array(platformSchema).optional(),
  sizeGoalLabel: z.string().max(100).nullish(),
  profileScope: audienceProfileScopeSchema.optional(),
  marketSide: audienceMarketSideSchema.optional(),
  researchMaturity: audienceResearchMaturitySchema.optional(),
  geography: audienceGeographySchema.nullish(),
  destinationGeography: audienceGeographySchema.nullish(),
  demographics: audienceDemographicsSchema.nullish(),
  context: audienceContextSchema.nullish(),
  source: audienceSourceSchema.optional(),
  sourceRef: z.string().max(500).nullish(),
  activeWindow: audienceActiveWindowSchema.nullish(),
  evidence: z.array(audienceEvidenceInputSchema).max(30).optional(),
};

async function syncActivations(
  tx: Parameters<Parameters<typeof withTransaction>[0]>[0],
  targetId: string,
  platforms: string[],
) {
  if (platforms.length === 0) {
    await tx
      .delete(audienceActivationTable)
      .where(eq(audienceActivationTable.targetId, targetId));
    return;
  }

  await tx
    .delete(audienceActivationTable)
    .where(
      and(
        eq(audienceActivationTable.targetId, targetId),
        notInArray(
          audienceActivationTable.platform,
          platforms as (typeof channelPlatformEnum.enumValues)[number][],
        ),
      ),
    );
  if (platforms.length > 0) {
    await tx
      .insert(audienceActivationTable)
      .values(
        platforms.map((platform) => ({
          targetId,
          platform: platform as (typeof channelPlatformEnum.enumValues)[number],
          geographyMode: "inherit",
          demographicsMode: "none",
        })),
      )
      .onConflictDoNothing();
  }
}

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
        with: { activations: true, evidence: true },
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
        const intended =
          t.activations.length > 0
            ? t.activations.map((activation) => activation.platform)
            : (t.intendedChannels ?? []);
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
      const { brandId, type, evidence, intendedChannels = [], ...rest } = input;
      return withTransaction(async (tx) => {
        const [target] = await tx
          .insert(audienceTargetTable)
          .values({
            brandId,
            slug: audienceSlug(input.name),
            type: type ?? "segment",
            intendedChannels,
            ...rest,
          })
          .onConflictDoUpdate({
            target: [audienceTargetTable.brandId, audienceTargetTable.slug],
            set: { ...rest, intendedChannels, deletedAt: null },
          })
          .returning();
        if (!target) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await syncActivations(tx, target.id, intendedChannels);
        if (evidence?.length) {
          await tx
            .insert(audienceEvidenceTable)
            .values(evidence.map((item) => ({ ...item, targetId: target.id })));
        }
        return target;
      });
    }),

  updateTarget: protectedProcedure
    .input(z.object({ id: z.string(), ...targetInput }).partial({ name: true }))
    .mutation(async ({ ctx, input }) => {
      const { id, evidence, intendedChannels, name, ...rest } = input;
      const existing = await ctx.db.query.audienceTargetTable.findFirst({
        where: eq(audienceTargetTable.id, id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await assertBrandAccess(ctx, existing.brandId);
      return withTransaction(async (tx) => {
        const [updated] = await tx
          .update(audienceTargetTable)
          .set({
            ...rest,
            ...(name !== undefined ? { name, slug: audienceSlug(name) } : {}),
            ...(intendedChannels !== undefined ? { intendedChannels } : {}),
          })
          .where(eq(audienceTargetTable.id, id))
          .returning();
        if (intendedChannels !== undefined) {
          await syncActivations(tx, id, intendedChannels);
        }
        if (evidence?.length) {
          await tx
            .insert(audienceEvidenceTable)
            .values(evidence.map((item) => ({ ...item, targetId: id })));
        }
        return updated;
      });
    }),

  updateActivation: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        type: typeSchema.optional(),
        status: activationStatusSchema.optional(),
        geographyMode: audienceActivationGeoModeSchema.optional(),
        geography: audienceGeographySchema.nullable().optional(),
        demographicsMode: audienceActivationDemographicModeSchema.optional(),
        demographics: audienceDemographicsSchema.nullable().optional(),
        targetingSpec: z.record(z.string(), z.unknown()).nullable().optional(),
        prompt: z.string().max(5000).nullable().optional(),
        exclusions: z.array(z.string().max(500)).max(100).nullable().optional(),
        specialAdCategory: z.string().max(100).nullable().optional(),
        complianceNotes: z.string().max(3000).nullable().optional(),
        reachEstimateLabel: z.string().max(100).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      const activation = await ctx.db.query.audienceActivationTable.findFirst({
        where: eq(audienceActivationTable.id, id),
        with: { target: { columns: { brandId: true } } },
      });
      if (!activation?.target) throw new TRPCError({ code: "NOT_FOUND" });
      await assertBrandAccess(ctx, activation.target.brandId);
      const [updated] = await ctx.db
        .update(audienceActivationTable)
        .set({
          ...changes,
          ...(changes.geographyMode === "inherit" ? { geography: null } : {}),
          ...(changes.demographicsMode === "none"
            ? { demographics: null }
            : {}),
        })
        .where(eq(audienceActivationTable.id, id))
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
