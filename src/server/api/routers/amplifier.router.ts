import type { Database } from "@/server/db";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

import { protectedProcedure, actionProcedure } from "@/server/api/orpc";
import {
  amplificationTargetTable,
  amplifierTable,
  brandTable,
  memberTable,
  platformPostTable,
} from "@/server/db/schema";
import { discoverAmplifierHandles } from "@/server/services/social-discovery.service";
import {
  listAmplifiers,
  notifyAmplification,
  requestAmplification,
  saveAmplifier,
  updateAmplification,
  createAmplificationOutput,
  readAmplificationTargets,
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

/**
 * Amplifiers — the lightweight contacts (investors / press / partners) recruited
 * to boost a launch, plus their per-moment targets. Discovery reuses the brand
 * social-handle flow (`discoverAmplifierHandles`).
 */
export const amplifierRouter = {
  list: actionProcedure(listAmplifiers),

  create: actionProcedure(saveAmplifier),
  update: actionProcedure(saveAmplifier),
  createOutput: actionProcedure(createAmplificationOutput),
  updateTarget: actionProcedure(updateAmplification),
  targets: actionProcedure(readAmplificationTargets),

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

  /** Explicit external handoff. Planning a target never sends Slack. */
  notifyTarget: actionProcedure(notifyAmplification),

  /** Drop an amplifier from a moment (leaves the rolodex row intact). */
  removeTarget: protectedProcedure
    .input(z.object({ targetId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      const target = await assertTargetAccess(ctx, input.targetId);
      if (target.outputPlatformPostId)
        throw new ORPCError("BAD_REQUEST", {
          message: "Remove the output draft before removing its assignment.",
        });
      await ctx.db
        .delete(amplificationTargetTable)
        .where(eq(amplificationTargetTable.id, input.targetId));
      return { ok: true };
    }),
};
