import { ORPCError } from "@orpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "@/server/api/orpc";
import type { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import {
  transactionalMessageTable,
  transactionalStatusEnum,
} from "@/server/db/transactional-schema";
import { renderTransactionalPreview } from "@/server/email/transactional-preview";

async function orgBrandIds(database: typeof db, userId: string) {
  const membership = await database.query.memberTable.findFirst({
    where: eq(memberTable.userId, userId),
  });
  if (!membership) {
    throw new ORPCError("FORBIDDEN", { message: "No organization." });
  }
  const brands = await database.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, membership.organizationId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true },
  });
  return brands.map((b) => b.id);
}

async function requireOwnedMessage(
  database: typeof db,
  userId: string,
  messageId: string,
) {
  const brandIds = await orgBrandIds(database, userId);
  const message = await database.query.transactionalMessageTable.findFirst({
    where: and(
      eq(transactionalMessageTable.id, messageId),
      isNull(transactionalMessageTable.deletedAt),
    ),
  });
  if (!message || !brandIds.includes(message.brandId)) {
    throw new ORPCError("NOT_FOUND", { message: "Message not found." });
  }
  return message;
}

export const transactionalRouter = {
  list: protectedProcedure.handler(async ({ context: ctx }) => {
    const brandIds = await orgBrandIds(ctx.db, ctx.session.user.id);
    if (!brandIds.length) return [];
    return ctx.db.query.transactionalMessageTable.findMany({
      where: and(
        inArray(transactionalMessageTable.brandId, brandIds),
        isNull(transactionalMessageTable.deletedAt),
      ),
      with: {
        brand: { columns: { id: true, name: true, slug: true } },
      },
      orderBy: (t, { asc }) => [asc(t.domain), asc(t.key)],
    });
  }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(transactionalStatusEnum.enumValues),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      await requireOwnedMessage(ctx.db, ctx.session.user.id, input.id);
      const [updatedRow] = await ctx.db
        .update(transactionalMessageTable)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(transactionalMessageTable.id, input.id))
        .returning();
      return updatedRow;
    }),

  updateNotes: protectedProcedure
    .input(z.object({ id: z.string(), notes: z.string().max(10_000) }))
    .handler(async ({ context: ctx, input }) => {
      await requireOwnedMessage(ctx.db, ctx.session.user.id, input.id);
      const [updatedRow] = await ctx.db
        .update(transactionalMessageTable)
        .set({ notes: input.notes || null, updatedAt: new Date() })
        .where(eq(transactionalMessageTable.id, input.id))
        .returning();
      return updatedRow;
    }),

  preview: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      const message = await requireOwnedMessage(
        ctx.db,
        ctx.session.user.id,
        input.id,
      );
      if (!message.templateKey) {
        return {
          ok: false as const,
          error: "No design-system template matched yet.",
        };
      }
      if (!message.previewProps) {
        return {
          ok: false as const,
          error: "No placeholder preview props curated yet.",
        };
      }
      return renderTransactionalPreview(
        message.templateKey,
        message.previewProps,
      );
    }),
};
