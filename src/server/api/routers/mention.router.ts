import type { TRPCRouterRecord } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import {
  MENTION_SOURCES,
  MENTION_STATUSES,
  mentionTable,
} from "@/server/db/listening-schema";

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
          // Scope to one surface (e.g. "reddit" for the Reddit room). Omit for all.
          source: z.enum(MENTION_SOURCES).optional(),
          includeSkipped: z.boolean().default(false),
          limit: z.number().int().min(1).max(500).default(200),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(mentionTable)
        .where(
          input?.source ? eq(mentionTable.source, input.source) : undefined,
        )
        .orderBy(desc(mentionTable.receivedAt))
        .limit(input?.limit ?? 200);
      const mentions = input?.includeSkipped
        ? rows
        : rows.filter((m) => m.status !== "skipped");
      return { mentions, skippedCount: rows.filter((m) => m.status === "skipped").length };
    }),

  setStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(MENTION_STATUSES),
        // Optional "we replied here" trail. Sending these on an already-engaged
        // mention just attaches the link after the fact. Lenient on URL shape so
        // pasting a reddit share link never bounces. null = clear.
        replyUrl: z.string().trim().nullish(),
        replyNote: z.string().trim().max(2000).nullish(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Engaged/skipped record WHO resolved it + when; reopening ("new") clears
      // the audit so it reads as untouched again.
      const resolving = input.status !== "new";

      const patch: Partial<typeof mentionTable.$inferInsert> = {
        status: input.status,
        resolvedById: resolving ? ctx.session.user.id : null,
        resolvedAt: resolving ? new Date() : null,
      };

      if (!resolving) {
        // Reopening wipes the reply trail too — reads as untouched again.
        patch.replyUrl = null;
        patch.replyNote = null;
      } else {
        // Only overwrite when the caller provided a value (undefined = leave
        // as-is, so a plain "Mark engaged" never clobbers an existing link).
        if (input.replyUrl !== undefined) patch.replyUrl = input.replyUrl || null;
        if (input.replyNote !== undefined)
          patch.replyNote = input.replyNote || null;
      }

      const [updated] = await db
        .update(mentionTable)
        .set(patch)
        .where(eq(mentionTable.id, input.id))
        .returning();
      return updated ?? null;
    }),

  /** Claim/assign a mention to a teammate (null = unclaim). Drives "my queue". */
  assign: protectedProcedure
    .input(z.object({ id: z.string(), userId: z.string().nullable() }))
    .mutation(async ({ input }) => {
      const [updated] = await db
        .update(mentionTable)
        .set({ assigneeId: input.userId })
        .where(eq(mentionTable.id, input.id))
        .returning();
      return updated ?? null;
    }),
} satisfies TRPCRouterRecord;
