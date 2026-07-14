import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { type db } from "@/server/db";
import {
  assistantMessageTable,
  assistantThreadTable,
  brandTable,
  contentPostTable,
  creativeRunTable,
  memberTable,
  productionPacketTable,
} from "@/server/db/schema";
import { isFalConfigured } from "@/server/clients/fal.client";
import {
  acceptCreativeCandidate,
  createProductionPacket,
  refreshCreativeRun,
  submitPacketToFal,
} from "@/server/services/creative-work.service";

type Database = typeof db;

async function membershipForUser(database: Database, userId: string) {
  const membership = await database.query.memberTable.findFirst({
    where: eq(memberTable.userId, userId),
    columns: { organizationId: true },
  });
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No organization" });
  }
  return membership;
}

async function accessibleThread(
  database: Database,
  threadId: string,
  organizationId: string,
  userId: string,
) {
  const thread = await database.query.assistantThreadTable.findFirst({
    where: and(
      eq(assistantThreadTable.id, threadId),
      eq(assistantThreadTable.organizationId, organizationId),
      or(
        eq(assistantThreadTable.createdBy, userId),
        eq(assistantThreadTable.visibility, "shared"),
      ),
    ),
  });
  if (!thread)
    throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
  return thread;
}

export const creativeWorkRouter = createTRPCRouter({
  configuration: protectedProcedure.query(() => ({
    falConfigured: isFalConfigured,
  })),

  listThreads: protectedProcedure.query(async ({ ctx }) => {
    const membership = await membershipForUser(ctx.db, ctx.session.user.id);
    return ctx.db.query.assistantThreadTable.findMany({
      where: and(
        eq(assistantThreadTable.organizationId, membership.organizationId),
        or(
          eq(assistantThreadTable.createdBy, ctx.session.user.id),
          eq(assistantThreadTable.visibility, "shared"),
        ),
      ),
      columns: {
        id: true,
        title: true,
        visibility: true,
        pinnedBrandId: true,
        activeContentPostId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [desc(assistantThreadTable.updatedAt)],
      limit: 50,
    });
  }),

  createThread: protectedProcedure
    .input(
      z.object({
        title: z.string().trim().min(1).max(120).optional(),
        brandId: z.string().optional(),
        contentPostId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await membershipForUser(ctx.db, ctx.session.user.id);
      let contentBrandId: string | undefined;
      if (input.contentPostId) {
        const content = await ctx.db.query.contentPostTable.findFirst({
          where: and(
            eq(contentPostTable.id, input.contentPostId),
            isNull(contentPostTable.deletedAt),
          ),
          columns: { brandId: true },
          with: { brand: { columns: { organizationId: true } } },
        });
        if (content?.brand?.organizationId !== membership.organizationId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        contentBrandId = content.brandId;
      }
      if (input.brandId) {
        const brand = await ctx.db.query.brandTable.findFirst({
          where: and(
            eq(brandTable.id, input.brandId),
            eq(brandTable.organizationId, membership.organizationId),
            isNull(brandTable.deletedAt),
          ),
          columns: { id: true },
        });
        if (!brand) throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (input.brandId && contentBrandId && input.brandId !== contentBrandId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Content does not belong to that brand",
        });
      }
      const [thread] = await ctx.db
        .insert(assistantThreadTable)
        .values({
          organizationId: membership.organizationId,
          createdBy: ctx.session.user.id,
          title: input.title ?? "New session",
          pinnedBrandId: input.brandId ?? contentBrandId,
          activeContentPostId: input.contentPostId,
        })
        .returning();
      if (!thread) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not create session",
        });
      }
      return thread;
    }),

  getThread: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const membership = await membershipForUser(ctx.db, ctx.session.user.id);
      const thread = await accessibleThread(
        ctx.db,
        input.threadId,
        membership.organizationId,
        ctx.session.user.id,
      );
      const messages = await ctx.db.query.assistantMessageTable.findMany({
        where: eq(assistantMessageTable.threadId, thread.id),
        orderBy: [assistantMessageTable.createdAt],
      });
      return { thread, messages: messages.map((row) => row.message) };
    }),

  renameThread: protectedProcedure
    .input(
      z.object({
        threadId: z.string(),
        title: z.string().trim().min(1).max(120),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await membershipForUser(ctx.db, ctx.session.user.id);
      const thread = await accessibleThread(
        ctx.db,
        input.threadId,
        membership.organizationId,
        ctx.session.user.id,
      );
      if (thread.createdBy !== ctx.session.user.id)
        throw new TRPCError({ code: "FORBIDDEN" });
      const [updated] = await ctx.db
        .update(assistantThreadTable)
        .set({ title: input.title })
        .where(eq(assistantThreadTable.id, thread.id))
        .returning();
      return updated;
    }),

  setThreadContext: protectedProcedure
    .input(
      z.object({
        threadId: z.string(),
        brandId: z.string().nullable().optional(),
        contentPostId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await membershipForUser(ctx.db, ctx.session.user.id);
      const thread = await accessibleThread(
        ctx.db,
        input.threadId,
        membership.organizationId,
        ctx.session.user.id,
      );
      if (thread.createdBy !== ctx.session.user.id)
        throw new TRPCError({ code: "FORBIDDEN" });
      if (input.brandId) {
        const brand = await ctx.db.query.brandTable.findFirst({
          where: and(
            eq(brandTable.id, input.brandId),
            eq(brandTable.organizationId, membership.organizationId),
            isNull(brandTable.deletedAt),
          ),
          columns: { id: true },
        });
        if (!brand) throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (input.contentPostId) {
        const content = await ctx.db.query.contentPostTable.findFirst({
          where: and(
            eq(contentPostTable.id, input.contentPostId),
            isNull(contentPostTable.deletedAt),
          ),
          columns: { brandId: true },
          with: { brand: { columns: { organizationId: true } } },
        });
        if (
          content?.brand?.organizationId !== membership.organizationId ||
          (input.brandId && content.brandId !== input.brandId)
        ) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }
      const [updated] = await ctx.db
        .update(assistantThreadTable)
        .set({
          ...(input.brandId !== undefined
            ? { pinnedBrandId: input.brandId }
            : {}),
          ...(input.contentPostId !== undefined
            ? { activeContentPostId: input.contentPostId }
            : {}),
        })
        .where(eq(assistantThreadTable.id, thread.id))
        .returning();
      return updated;
    }),

  deleteThread: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await membershipForUser(ctx.db, ctx.session.user.id);
      const thread = await accessibleThread(
        ctx.db,
        input.threadId,
        membership.organizationId,
        ctx.session.user.id,
      );
      if (thread.createdBy !== ctx.session.user.id)
        throw new TRPCError({ code: "FORBIDDEN" });
      await ctx.db
        .delete(assistantThreadTable)
        .where(eq(assistantThreadTable.id, thread.id));
      return { ok: true as const };
    }),

  listPackets: protectedProcedure
    .input(
      z.object({
        threadId: z.string().optional(),
        brandId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const membership = await membershipForUser(ctx.db, ctx.session.user.id);
      return ctx.db.query.productionPacketTable.findMany({
        where: and(
          eq(productionPacketTable.organizationId, membership.organizationId),
          input.threadId
            ? eq(productionPacketTable.threadId, input.threadId)
            : undefined,
          input.brandId
            ? eq(productionPacketTable.brandId, input.brandId)
            : undefined,
        ),
        orderBy: [desc(productionPacketTable.createdAt)],
        limit: 50,
      });
    }),

  createPacket: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        contentPostId: z.string().optional(),
        threadId: z.string().optional(),
        title: z.string().trim().min(1).max(160),
        purpose: z.string().trim().optional(),
        prompt: z.string().trim().min(1),
        negativePrompt: z.string().trim().optional(),
        aspectRatio: z.string().trim().optional(),
        outputFormat: z.string().trim().optional(),
        suggestedTool: z.string().trim().optional(),
        instructions: z.string().trim().optional(),
        referenceMediaAssetIds: z.array(z.string()).max(12).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await membershipForUser(ctx.db, ctx.session.user.id);
      return createProductionPacket({
        ...input,
        organizationId: membership.organizationId,
        userId: ctx.session.user.id,
      });
    }),

  submitFal: protectedProcedure
    .input(z.object({ packetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await membershipForUser(ctx.db, ctx.session.user.id);
      return submitPacketToFal({
        packetId: input.packetId,
        organizationId: membership.organizationId,
        userId: ctx.session.user.id,
      });
    }),

  getRun: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ ctx, input }) => {
      const membership = await membershipForUser(ctx.db, ctx.session.user.id);
      const run = await ctx.db.query.creativeRunTable.findFirst({
        where: and(
          eq(creativeRunTable.id, input.runId),
          eq(creativeRunTable.organizationId, membership.organizationId),
        ),
      });
      if (!run) throw new TRPCError({ code: "NOT_FOUND" });
      return run;
    }),

  refreshRun: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await membershipForUser(ctx.db, ctx.session.user.id);
      return refreshCreativeRun({
        runId: input.runId,
        organizationId: membership.organizationId,
      });
    }),

  acceptCandidate: protectedProcedure
    .input(
      z.object({
        runId: z.string(),
        candidateIndex: z.number().int().min(0).max(8),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await membershipForUser(ctx.db, ctx.session.user.id);
      return acceptCreativeCandidate({
        ...input,
        organizationId: membership.organizationId,
        userId: ctx.session.user.id,
      });
    }),
});
