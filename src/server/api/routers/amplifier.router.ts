import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  amplificationTargetTable,
  amplifierTable,
  brandInspirationTable,
  brandTable,
  channelPlatformEnum,
  channelTable,
  initiativeTable,
  memberTable,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { discoverAmplifierHandles } from "@/server/services/social-discovery.service";

type Ctx = {
  db: typeof import("@/server/db").db;
  session: { user: { id: string } };
};

async function orgIdFor(ctx: Ctx): Promise<string | null> {
  const m = await ctx.db.query.memberTable.findFirst({
    where: eq(memberTable.userId, ctx.session.user.id),
    with: { organization: true },
  });
  return m?.organization?.id ?? null;
}

async function assertOrgMembership(ctx: Ctx, organizationId: string) {
  const membership = await ctx.db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.userId, ctx.session.user.id),
      eq(memberTable.organizationId, organizationId),
    ),
  });
  if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
}

async function assertAmplifierAccess(ctx: Ctx, id: string) {
  const amplifier = await ctx.db.query.amplifierTable.findFirst({
    where: and(eq(amplifierTable.id, id), isNull(amplifierTable.deletedAt)),
  });
  if (!amplifier) throw new TRPCError({ code: "NOT_FOUND" });
  await assertOrgMembership(ctx, amplifier.organizationId);
  return amplifier;
}

async function assertMomentAccess(ctx: Ctx, id: string) {
  const moment = await ctx.db.query.initiativeTable.findFirst({
    where: and(eq(initiativeTable.id, id), isNull(initiativeTable.deletedAt)),
  });
  if (!moment) throw new TRPCError({ code: "NOT_FOUND" });
  const brand = await ctx.db.query.brandTable.findFirst({
    where: and(eq(brandTable.id, moment.brandId), isNull(brandTable.deletedAt)),
  });
  if (!brand?.organizationId) throw new TRPCError({ code: "NOT_FOUND" });
  await assertOrgMembership(ctx, brand.organizationId);
  return { moment, brand };
}

async function assertTargetAccess(ctx: Ctx, id: string) {
  const target = await ctx.db.query.amplificationTargetTable.findFirst({
    where: eq(amplificationTargetTable.id, id),
  });
  if (!target) throw new TRPCError({ code: "NOT_FOUND" });
  const amplifier = await assertAmplifierAccess(ctx, target.amplifierId);
  const { brand } = await assertMomentAccess(ctx, target.momentId);
  if (brand.organizationId !== amplifier.organizationId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return target;
}

export function profileUrlForAmplifierHandle(platform: string, handle: string) {
  const clean = handle.replace(/^@/, "").trim();
  if (!clean) return null;
  const roots: Record<string, string> = {
    linkedin: "https://www.linkedin.com/in/",
    instagram: "https://www.instagram.com/",
    x: "https://x.com/",
    facebook: "https://www.facebook.com/",
    youtube: "https://www.youtube.com/@",
    tiktok: "https://www.tiktok.com/@",
    threads: "https://www.threads.net/@",
  };
  return roots[platform] ? `${roots[platform]}${clean}` : null;
}

const handleSchema = z.object({ platform: z.string(), handle: z.string() });

/**
 * Amplifiers — the lightweight contacts (investors / press / partners) recruited
 * to boost a launch, plus their per-moment targets. Discovery reuses the brand
 * social-handle flow (`discoverAmplifierHandles`).
 */
export const amplifierRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const org = await orgIdFor(ctx);
    if (!org) return [];
    return ctx.db.query.amplifierTable.findMany({
      where: and(
        eq(amplifierTable.organizationId, org),
        isNull(amplifierTable.deletedAt),
      ),
      orderBy: [desc(amplifierTable.createdAt)],
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        type: z.string().optional(),
        handles: z.array(handleSchema).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const org = await orgIdFor(ctx);
      if (!org) throw new TRPCError({ code: "FORBIDDEN" });
      const [a] = await ctx.db
        .insert(amplifierTable)
        .values({
          organizationId: org,
          name: input.name,
          type: input.type,
          handles: input.handles ?? [],
        })
        .returning();
      return a;
    }),

  /** Edit a rolodex amplifier (name / type / handles / notes). */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        type: z.string().optional(),
        handles: z.array(handleSchema).optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const org = await orgIdFor(ctx);
      if (!org) throw new TRPCError({ code: "FORBIDDEN" });
      const { id, ...patch } = input;
      const [a] = await ctx.db
        .update(amplifierTable)
        .set(patch)
        .where(
          and(
            eq(amplifierTable.id, id),
            eq(amplifierTable.organizationId, org),
          ),
        )
        .returning();
      return a;
    }),

  /** Soft-delete a rolodex amplifier (keeps past moment history intact). */
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const org = await orgIdFor(ctx);
      if (!org) throw new TRPCError({ code: "FORBIDDEN" });
      await ctx.db
        .update(amplifierTable)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(amplifierTable.id, input.id),
            eq(amplifierTable.organizationId, org),
          ),
        );
      return { ok: true };
    }),

  /** Discover the amplifier's social handles (same flow as brands). */
  discoverHandles: protectedProcedure
    .input(z.object({ amplifierId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertAmplifierAccess(ctx, input.amplifierId);
      return discoverAmplifierHandles(input.amplifierId);
    }),

  /** Graduate a contact into a tracked personal brand for one owned brand. */
  promoteToTrackedBrand: protectedProcedure
    .input(z.object({ amplifierId: z.string(), ownerBrandId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const amplifier = await assertAmplifierAccess(ctx, input.amplifierId);
      const owner = await ctx.db.query.brandTable.findFirst({
        where: and(
          eq(brandTable.id, input.ownerBrandId),
          isNull(brandTable.deletedAt),
        ),
      });
      if (!owner?.organizationId) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMembership(ctx, owner.organizationId);
      if (owner.organizationId !== amplifier.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      let tracked = amplifier.promotedBrandId
        ? await ctx.db.query.brandTable.findFirst({
            where: eq(brandTable.id, amplifier.promotedBrandId),
          })
        : null;
      if (!tracked) {
        [tracked] = await ctx.db
          .insert(brandTable)
          .values({
            id: createId("brand"),
            name: amplifier.name,
            type: "personal",
          })
          .returning();
      }
      if (!tracked) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await ctx.db
        .insert(brandInspirationTable)
        .values({
          id: createId("insp"),
          brandId: owner.id,
          inspirationBrandId: tracked.id,
          purpose: "inspiration",
        })
        .onConflictDoNothing();

      const supportedPlatforms = new Set<string>(
        channelPlatformEnum.enumValues,
      );
      for (const h of amplifier.handles ?? []) {
        if (!supportedPlatforms.has(h.platform)) continue;
        const platform =
          h.platform as (typeof channelPlatformEnum.enumValues)[number];
        const existing = await ctx.db.query.channelTable.findFirst({
          where: and(
            eq(channelTable.brandId, tracked.id),
            eq(channelTable.platform, platform),
            isNull(channelTable.deletedAt),
          ),
        });
        if (!existing) {
          await ctx.db.insert(channelTable).values({
            id: createId("chan"),
            brandId: tracked.id,
            kind: "social",
            platform,
            handle: h.handle.replace(/^@/, ""),
            profileUrl: profileUrlForAmplifierHandle(h.platform, h.handle),
            connectionStatus: "disconnected",
          });
        }
      }
      await ctx.db
        .update(amplifierTable)
        .set({ promotedBrandId: tracked.id })
        .where(eq(amplifierTable.id, amplifier.id));
      return tracked;
    }),

  /** Recruit an amplifier for a moment (the raised initiative). */
  addTarget: protectedProcedure
    .input(
      z.object({
        momentId: z.string(),
        amplifierId: z.string(),
        ask: z.string().optional(),
        plannedAt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [{ brand }, amplifier] = await Promise.all([
        assertMomentAccess(ctx, input.momentId),
        assertAmplifierAccess(ctx, input.amplifierId),
      ]);
      if (brand.organizationId !== amplifier.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const [t] = await ctx.db
        .insert(amplificationTargetTable)
        .values({
          momentId: input.momentId,
          amplifierId: input.amplifierId,
          ask: input.ask ?? "planned",
          plannedAt: input.plannedAt ? new Date(input.plannedAt) : undefined,
        })
        .returning();
      return t;
    }),

  targetsForMoment: protectedProcedure
    .input(z.object({ momentId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertMomentAccess(ctx, input.momentId);
      return ctx.db.query.amplificationTargetTable.findMany({
        where: eq(amplificationTargetTable.momentId, input.momentId),
        with: { amplifier: true },
        orderBy: [desc(amplificationTargetTable.createdAt)],
      });
    }),

  /** Advance/rewind the recruitment status of a target. */
  setTargetAsk: protectedProcedure
    .input(
      z.object({
        targetId: z.string(),
        ask: z.enum(["planned", "asked", "confirmed", "fulfilled"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertTargetAccess(ctx, input.targetId);
      const [t] = await ctx.db
        .update(amplificationTargetTable)
        .set({
          ask: input.ask,
          // Stamp/clear fulfillment when toggled by hand (the retweet-matcher
          // sets fulfilledByPostId separately).
          fulfilledAt: input.ask === "fulfilled" ? new Date() : null,
        })
        .where(eq(amplificationTargetTable.id, input.targetId))
        .returning();
      return t;
    }),

  /** Drop an amplifier from a moment (leaves the rolodex row intact). */
  removeTarget: protectedProcedure
    .input(z.object({ targetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertTargetAccess(ctx, input.targetId);
      await ctx.db
        .delete(amplificationTargetTable)
        .where(eq(amplificationTargetTable.id, input.targetId));
      return { ok: true };
    }),
});
