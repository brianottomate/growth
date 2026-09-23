import type { Database } from "@/server/db";
import { z } from "zod";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

import { protectedProcedure, actionProcedure } from "@/server/api/orpc";
import {
  amplificationTargetTable,
  amplifierTable,
  brandTable,
  contentPostTable,
  campaignTable,
  memberTable,
  platformPostTable,
} from "@/server/db/schema";
import { isSlackMemberId } from "@/lib/amplification-slack";
import { discoverAmplifierHandles } from "@/server/services/social-discovery.service";
import {
  listAmplifiers,
  notifyAmplification,
  requestAmplification,
} from "@/server/ai/capabilities/amplification";

type Ctx = {
  db: Database;
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
  if (!membership) throw new ORPCError("FORBIDDEN");
}

async function assertAmplifierAccess(ctx: Ctx, id: string) {
  const amplifier = await ctx.db.query.amplifierTable.findFirst({
    where: and(eq(amplifierTable.id, id), isNull(amplifierTable.deletedAt)),
  });
  if (!amplifier) throw new ORPCError("NOT_FOUND");
  await assertOrgMembership(ctx, amplifier.organizationId);
  return amplifier;
}

async function assertMomentAccess(ctx: Ctx, id: string) {
  const moment = await ctx.db.query.campaignTable.findFirst({
    where: and(eq(campaignTable.id, id), isNull(campaignTable.deletedAt)),
  });
  if (!moment) throw new ORPCError("NOT_FOUND");
  const brand = await ctx.db.query.brandTable.findFirst({
    where: and(eq(brandTable.id, moment.brandId), isNull(brandTable.deletedAt)),
  });
  if (!brand?.organizationId) throw new ORPCError("NOT_FOUND");
  await assertOrgMembership(ctx, brand.organizationId);
  return { moment, brand };
}

async function assertPostAccess(ctx: Ctx, id: string) {
  const post = await ctx.db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, id),
  });
  if (!post) throw new ORPCError("NOT_FOUND");
  const brand = await ctx.db.query.brandTable.findFirst({
    where: and(eq(brandTable.id, post.brandId), isNull(brandTable.deletedAt)),
  });
  if (!brand?.organizationId) throw new ORPCError("NOT_FOUND");
  await assertOrgMembership(ctx, brand.organizationId);
  return { post, brand };
}

async function assertTargetAccess(ctx: Ctx, id: string) {
  const target = await ctx.db.query.amplificationTargetTable.findFirst({
    where: eq(amplificationTargetTable.id, id),
  });
  if (!target) throw new ORPCError("NOT_FOUND");
  const amplifier = await assertAmplifierAccess(ctx, target.amplifierId);
  const { brand } = await assertPostAccess(ctx, target.platformPostId);
  if (brand.organizationId !== amplifier.organizationId) {
    throw new ORPCError("FORBIDDEN");
  }
  return target;
}

/** The campaign's platform posts (via its content items) — the candidates an
 * amplification ask can anchor to. */
async function platformPostsForCampaign(ctx: Ctx, campaignId: string) {
  const contents = await ctx.db.query.contentPostTable.findMany({
    where: and(
      eq(contentPostTable.campaignId, campaignId),
      isNull(contentPostTable.deletedAt),
    ),
    columns: { id: true, title: true },
  });
  if (contents.length === 0) return [];
  const titleById = new Map(contents.map((c) => [c.id, c.title]));
  const posts = await ctx.db.query.platformPostTable.findMany({
    where: inArray(
      platformPostTable.contentPostId,
      contents.map((c) => c.id),
    ),
    columns: {
      id: true,
      contentPostId: true,
      platform: true,
      status: true,
      scheduledAt: true,
    },
  });
  return posts.map((post) => ({
    ...post,
    title: post.contentPostId
      ? (titleById.get(post.contentPostId) ?? null)
      : null,
  }));
}

const handleSchema = z.object({ platform: z.string(), handle: z.string() });
const slackUserIdSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isSlackMemberId, "Use a Slack member ID such as U012ABCDEF");

/**
 * Amplifiers — the lightweight contacts (investors / press / partners) recruited
 * to boost a launch, plus their per-moment targets. Discovery reuses the brand
 * social-handle flow (`discoverAmplifierHandles`).
 */
export const amplifierRouter = {
  list: actionProcedure(listAmplifiers),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        type: z.string().optional(),
        handles: z.array(handleSchema).optional(),
        notes: z.string().max(1000).optional(),
        slackUserId: slackUserIdSchema.optional(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const org = await orgIdFor(ctx);
      if (!org) throw new ORPCError("FORBIDDEN");
      const [a] = await ctx.db
        .insert(amplifierTable)
        .values({
          organizationId: org,
          name: input.name,
          type: input.type,
          handles: input.handles ?? [],
          notes: input.notes,
          slackUserId: input.slackUserId,
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
        slackUserId: slackUserIdSchema.nullable().optional(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const org = await orgIdFor(ctx);
      if (!org) throw new ORPCError("FORBIDDEN");
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
    .handler(async ({ context: ctx, input }) => {
      const org = await orgIdFor(ctx);
      if (!org) throw new ORPCError("FORBIDDEN");
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
    .handler(async ({ context: ctx, input }) => {
      await assertAmplifierAccess(ctx, input.amplifierId);
      return discoverAmplifierHandles(input.amplifierId);
    }),

  /** Recruit amplifiers for one platform post. */
  addTarget: actionProcedure(requestAmplification),

  /** All targets across a campaign's posts (the roll-up view). */
  targetsForCampaign: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      await assertMomentAccess(ctx, input.campaignId);
      const posts = await platformPostsForCampaign(ctx, input.campaignId);
      if (posts.length === 0) return { targets: [], posts: [] };
      const targets = await ctx.db.query.amplificationTargetTable.findMany({
        where: inArray(
          amplificationTargetTable.platformPostId,
          posts.map((post) => post.id),
        ),
        with: { amplifier: true },
        orderBy: [desc(amplificationTargetTable.createdAt)],
      });
      return { targets, posts };
    }),

  /** Advance/rewind the recruitment status of a target. */
  setTargetAsk: protectedProcedure
    .input(
      z.object({
        targetId: z.string(),
        ask: z.enum(["planned", "asked", "confirmed", "fulfilled"]),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
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

  /** Explicit external handoff. Planning a target never sends Slack. */
  notifyTarget: actionProcedure(notifyAmplification),

  /** Drop an amplifier from a moment (leaves the rolodex row intact). */
  removeTarget: protectedProcedure
    .input(z.object({ targetId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      await assertTargetAccess(ctx, input.targetId);
      await ctx.db
        .delete(amplificationTargetTable)
        .where(eq(amplificationTargetTable.id, input.targetId));
      return { ok: true };
    }),
};
