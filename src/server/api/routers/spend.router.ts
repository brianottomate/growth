import type { TRPCRouterRecord } from "@trpc/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";

import {
  buildSpendTrend,
  getSpendTracker,
  resolveSpendWindow,
  SPEND_TRACKER_CACHE_TAG,
} from "@/server/services/spend-tracker/spend-tracker.service";

import { adminProcedure, protectedProcedure } from "../trpc";

// Spend Tracker (/app/spend) — marketing unit-economics dashboard, ported from
// Brian's wander-growth-tracker. Global scope (org-wide Wander view, no brand
// filter — any @wander.com user). Methodology in spend-tracker.config.ts.

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const windowInput = z.object({
  start: dateStr.optional(),
  end: dateStr.optional(),
  days: z.number().int().min(1).max(730).optional(),
});

export const spendRouter = {
  dashboard: protectedProcedure.input(windowInput).query(async ({ input }) => {
    const { startDate, endDate } = resolveSpendWindow(input);
    const { summary } = await getSpendTracker(startDate, endDate);
    return { window: { startDate, endDate }, summary };
  }),

  trends: protectedProcedure.input(windowInput).query(async ({ input }) => {
    const { startDate, endDate } = resolveSpendWindow(input);
    const { rows } = await getSpendTracker(startDate, endDate);
    return { window: { startDate, endDate }, series: buildSpendTrend(rows) };
  }),

  health: protectedProcedure.input(windowInput).query(async ({ input }) => {
    const { startDate, endDate } = resolveSpendWindow(input);
    const { summary } = await getSpendTracker(startDate, endDate);
    return {
      window: { startDate, endDate },
      dataHealth: summary.dataHealth,
      dataFreshness: summary.dataFreshness,
    };
  }),

  refresh: adminProcedure.mutation(async () => {
    revalidateTag(SPEND_TRACKER_CACHE_TAG, "max");
    return { revalidated: true, at: new Date().toISOString() };
  }),
} satisfies TRPCRouterRecord;
