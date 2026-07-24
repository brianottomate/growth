import type { TRPCRouterRecord } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import {
  AFFILIATE_ITEM_KINDS,
  AFFILIATE_ITEM_STATUSES,
  affiliateItemTable,
  partnerProgramTable,
} from "@/server/db/affiliate-schema";
import { postAffiliateItemToRadio } from "@/server/services/affiliate-notify.service";

import { protectedProcedure } from "../trpc";

/**
 * Affiliate ops desk — the triage queue for the in-house affiliate program
 * (docs/affiliate-program-takeover.md). Items are written by the inbound-email
 * pipeline (and later the monitor crons); the team resolves them here, mirroring
 * the mention-queue grammar from /app/listen.
 */
export const affiliateRouter = {
  overview: protectedProcedure.query(async () => {
    const programs = await db
      .select()
      .from(partnerProgramTable)
      .orderBy(desc(partnerProgramTable.createdAt));
    return { programs };
  }),

  list: protectedProcedure
    .input(
      z
        .object({
          kind: z.enum(AFFILIATE_ITEM_KINDS).optional(),
          includeDismissed: z.boolean().default(false),
          limit: z.number().int().min(1).max(500).default(200),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(affiliateItemTable)
        .where(
          input?.kind ? eq(affiliateItemTable.kind, input.kind) : undefined,
        )
        .orderBy(
          desc(affiliateItemTable.receivedAt),
          desc(affiliateItemTable.createdAt),
        )
        .limit(input?.limit ?? 200);
      const items = input?.includeDismissed
        ? rows
        : rows.filter((i) => i.status !== "dismissed");
      return {
        items,
        dismissedCount: rows.filter((i) => i.status === "dismissed").length,
      };
    }),

  setStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(AFFILIATE_ITEM_STATUSES),
        // Proof-of-work ("replied from Gmail") + the reasoned why. Undefined =
        // leave as-is; null/empty = clear. Reopening wipes both.
        replyNote: z.string().trim().max(2000).nullish(),
        decisionNote: z.string().trim().max(4000).nullish(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const resolving = input.status !== "open";

      const patch: Partial<typeof affiliateItemTable.$inferInsert> = {
        status: input.status,
        resolvedById: resolving ? ctx.session.user.id : null,
        resolvedAt: resolving ? new Date() : null,
      };

      if (!resolving) {
        patch.replyNote = null;
        patch.decisionNote = null;
      } else {
        if (input.replyNote !== undefined)
          patch.replyNote = input.replyNote || null;
        if (input.decisionNote !== undefined)
          patch.decisionNote = input.decisionNote || null;
      }

      const [updated] = await db
        .update(affiliateItemTable)
        .set(patch)
        .where(eq(affiliateItemTable.id, input.id))
        .returning();
      return updated ?? null;
    }),

  /** Claim/assign an item to a teammate (null = unclaim). */
  assign: protectedProcedure
    .input(z.object({ id: z.string(), userId: z.string().nullable() }))
    .mutation(async ({ input }) => {
      const [updated] = await db
        .update(affiliateItemTable)
        .set({ assigneeId: input.userId })
        .where(eq(affiliateItemTable.id, input.id))
        .returning();
      return updated ?? null;
    }),

  /**
   * Force-send one item to the affiliate radio channel — a manual smoke test of
   * the Slack plumbing (outside prod it lands in #radio-slack-testing).
   */
  testSlack: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const [item] = await db
        .select()
        .from(affiliateItemTable)
        .where(eq(affiliateItemTable.id, input.id))
        .limit(1);
      if (!item) return { success: false as const, error: "Item not found" };

      const result = await postAffiliateItemToRadio(item);
      return result.success
        ? { success: true as const, channel: result.channel }
        : { success: false as const, error: result.error };
    }),
} satisfies TRPCRouterRecord;
