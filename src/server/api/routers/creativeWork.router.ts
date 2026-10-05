import {
  listCreativeDocuments,
  readCreativeDocument,
  createCreativeDocumentAction,
  saveCreativeDocumentAction,
  selectCreativeDocumentAction,
  produceCreativeDocument,
  cancelCreativeDocumentRun,
  pullCreativeDato,
  pushCreativeDato,
} from "@/server/ai/capabilities/creative-documents";
import { actionProcedure } from "@/server/api/orpc";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { CREATIVE_IMAGE_MODEL_IDS } from "@/lib/creative-image-models";
import { resolvePageContext } from "@/server/ai/kernel/resolve-page-context";
import { workspaceProcedure, protectedProcedure } from "@/server/api/orpc";
import { type db } from "@/server/db";
import {
  assistantMessageTable,
  assistantThreadTable,
  brandTable,
  contentPostTable,
  workflowRunTable,
} from "@/server/db/schema";
import { getWanderMembership } from "@/server/wander-workspace";
import { isFalConfigured } from "@/server/clients/fal.client";
import { isGeminiImageConfigured } from "@/server/clients/gemini-image.client";
import {
  acceptCreativeCandidate,
  refreshCreativeRun,
  submitPacketForImageGeneration,
} from "@/server/services/creative-work.service";

type Database = typeof db;

async function membershipForUser(database: Database, userId: string) {
  const membership = await getWanderMembership(userId, database);
  if (!membership) {
    throw new ORPCError("FORBIDDEN", { message: "No access to Wander Growth" });
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
    throw new ORPCError("NOT_FOUND", { message: "Session not found" });
  return thread;
}

export const creativeWorkRouter = {
  documents: actionProcedure(listCreativeDocuments),
  document: actionProcedure(readCreativeDocument),
  createDocument: actionProcedure(createCreativeDocumentAction),
  saveDocument: actionProcedure(saveCreativeDocumentAction),
  selectDocument: actionProcedure(selectCreativeDocumentAction),
  produceDocument: actionProcedure(produceCreativeDocument),
  cancelDocumentRun: actionProcedure(cancelCreativeDocumentRun),
  pullDato: actionProcedure(pullCreativeDato),
  pushDato: actionProcedure(pushCreativeDato),
  pageContext: workspaceProcedure
    .input(z.object({ path: z.string() }))
    .handler(({ input, context }) =>
      resolvePageContext(input.path, context.workspace.orgId),
    ),
  configuration: protectedProcedure.handler(() => ({
    falConfigured: isFalConfigured,
    googleConfigured: isGeminiImageConfigured,
  })),

  listThreads: protectedProcedure.handler(async ({ context: ctx }) => {
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
    .handler(async ({ context: ctx, input }) => {
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
          throw new ORPCError("FORBIDDEN");
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
        if (!brand) throw new ORPCError("FORBIDDEN");
      }
      if (input.brandId && contentBrandId && input.brandId !== contentBrandId) {
        throw new ORPCError("BAD_REQUEST", {
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
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Could not create session",
        });
      }
      return thread;
    }),

  getThread: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
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

  submitImage: protectedProcedure
    .input(
      z.object({
        packetId: z.string(),
        modelProfile: z.enum(CREATIVE_IMAGE_MODEL_IDS),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const membership = await membershipForUser(ctx.db, ctx.session.user.id);
      return submitPacketForImageGeneration({
        ...input,
        organizationId: membership.organizationId,
        userId: ctx.session.user.id,
      });
    }),

  latestRunForPacket: protectedProcedure
    .input(z.object({ packetId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      const membership = await membershipForUser(ctx.db, ctx.session.user.id);
      return (
        (await ctx.db.query.workflowRunTable.findFirst({
          where: and(
            eq(workflowRunTable.packetId, input.packetId),
            eq(workflowRunTable.organizationId, membership.organizationId),
          ),
          orderBy: [desc(workflowRunTable.createdAt)],
        })) ?? null
      );
    }),

  refreshRun: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
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
    .handler(async ({ context: ctx, input }) => {
      const membership = await membershipForUser(ctx.db, ctx.session.user.id);
      return acceptCreativeCandidate({
        ...input,
        organizationId: membership.organizationId,
        userId: ctx.session.user.id,
      });
    }),
};
