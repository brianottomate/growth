import type { TRPCRouterRecord } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { envSelect } from "@/env";
import { db } from "@/server/db";
import {
  MENTION_SOURCES,
  MENTION_STATUSES,
  mentionTable,
} from "@/server/db/listening-schema";
import { postMentionToRadio } from "@/server/services/listening-notify.service";

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
      return {
        mentions,
        skippedCount: rows.filter((m) => m.status === "skipped").length,
      };
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
        // The reasoned "why" for this disposition (esp. a pass). null = clear.
        decisionNote: z.string().trim().max(4000).nullish(),
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
        // Reopening wipes the reply + decision trail too — reads as untouched.
        patch.replyUrl = null;
        patch.replyNote = null;
        patch.decisionNote = null;
      } else {
        // Only overwrite when the caller provided a value (undefined = leave
        // as-is, so a plain "Mark engaged" never clobbers an existing link).
        if (input.replyUrl !== undefined)
          patch.replyUrl = input.replyUrl || null;
        if (input.replyNote !== undefined)
          patch.replyNote = input.replyNote || null;
        if (input.decisionNote !== undefined)
          patch.decisionNote = input.decisionNote || null;
      }

      const [updated] = await db
        .update(mentionTable)
        .set(patch)
        .where(eq(mentionTable.id, input.id))
        .returning();
      return updated ?? null;
    }),

  /**
   * Fire this mention at #radio-social-listening on demand — a manual smoke test
   * of the Slack broadcast path. Force-sends regardless of the engage filter, and
   * outside prod `postOnSlack` redirects to #radio-slack-testing. Returns the
   * target channel so the UI can say where it landed, or the Slack error
   * (missing token, not_in_channel, …) so the dev sees what to fix.
   */
  testSlack: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const channel = envSelect({
        prod: "#radio-social-listening",
        test: "#radio-slack-testing",
      });

      const [mention] = await db
        .select()
        .from(mentionTable)
        .where(eq(mentionTable.id, input.id))
        .limit(1);
      if (!mention)
        return { success: false as const, error: "Mention not found" };

      const result = await postMentionToRadio(mention);
      return result.success
        ? { success: true as const, channel }
        : { success: false as const, error: result.error };
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
