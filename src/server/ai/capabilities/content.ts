import "server-only";

import { z } from "zod";
import { and, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { contentPostTable } from "@/server/db/content-schema";
import { defineCapability } from "./types";
import { orgBrandIds } from "./brands";

export const contentPipelineSummary = defineCapability({
  name: "contentPipelineSummary",
  description:
    "Summarize the content pipeline for the organization: a count of content posts grouped by status (slot, draft, discovered, pending_review, approved, scheduled, published, rejected, archived). Use for 'what's in the pipeline / how much is scheduled / what needs review' questions.",
  inputSchema: z.object({}),
  readOnly: true,
  domain: "content",
  execute: async (_input, ctx) => {
    const brandIds = await orgBrandIds(ctx.orgId);
    if (brandIds.length === 0) return { total: 0, byStatus: [] };

    const rows = await db
      .select({
        status: contentPostTable.status,
        count: sql<number>`count(*)::int`,
      })
      .from(contentPostTable)
      .where(inArray(contentPostTable.brandId, brandIds))
      .groupBy(contentPostTable.status);

    const total = rows.reduce((sum, r) => sum + r.count, 0);
    return { total, byStatus: rows };
  },
});

export const upcomingContent = defineCapability({
  name: "upcomingContent",
  description:
    "List content posts planned from now onward, soonest first (by their planned date on the calendar). Use for 'what's coming up / what's planned this week / what's on the calendar' questions.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(15),
  }),
  readOnly: true,
  domain: "content",
  execute: async (input, ctx) => {
    const brandIds = await orgBrandIds(ctx.orgId);
    if (brandIds.length === 0) return { posts: [] };

    const posts = await db
      .select({
        id: contentPostTable.id,
        title: contentPostTable.title,
        brandId: contentPostTable.brandId,
        status: contentPostTable.status,
        pillar: contentPostTable.pillar,
        plannedAt: contentPostTable.plannedAt,
      })
      .from(contentPostTable)
      .where(
        and(
          inArray(contentPostTable.brandId, brandIds),
          gte(contentPostTable.plannedAt, new Date()),
        ),
      )
      .orderBy(contentPostTable.plannedAt)
      .limit(input.limit);

    return { posts };
  },
});

// Count of posts awaiting a human (draft + pending_review), used by the
// overview aggregator. Kept private — promote to a capability if needed.
export async function needsAttentionCount(orgId: string): Promise<number> {
  const brandIds = await orgBrandIds(orgId);
  if (brandIds.length === 0) return 0;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentPostTable)
    .where(
      and(
        inArray(contentPostTable.brandId, brandIds),
        inArray(contentPostTable.status, ["draft", "pending_review"]),
      ),
    );
  return row?.count ?? 0;
}
