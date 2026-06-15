import type { TRPCRouterRecord } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import { MENTION_STATUSES, mentionTable } from "@/server/db/listening-schema";

import { protectedProcedure } from "../trpc";

/**
 * Mentions — persisted inbound keyword hits (F5Bot today, other providers
 * later). Unlike the X/Reddit on-demand scans, these are written to the DB by
 * the Resend inbound webhook, so triage status survives reloads and is shared
 * across the team.
 */
export const mentionRouter = {
  list: protectedProcedure
    .input(
      z
        .object({
          includeSkipped: z.boolean().default(false),
          limit: z.number().int().min(1).max(500).default(200),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(mentionTable)
        .orderBy(desc(mentionTable.receivedAt))
        .limit(input?.limit ?? 200);
      const mentions = input?.includeSkipped
        ? rows
        : rows.filter((m) => m.status !== "skipped");
      return { mentions, skippedCount: rows.filter((m) => m.status === "skipped").length };
    }),

  setStatus: protectedProcedure
    .input(z.object({ id: z.string(), status: z.enum(MENTION_STATUSES) }))
    .mutation(async ({ input }) => {
      const [updated] = await db
        .update(mentionTable)
        .set({ status: input.status })
        .where(eq(mentionTable.id, input.id))
        .returning();
      return updated ?? null;
    }),
} satisfies TRPCRouterRecord;
