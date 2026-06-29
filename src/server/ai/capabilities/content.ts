import "server-only";

import { z } from "zod";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { contentPostTable } from "@/server/db/content-schema";
import { brandTable, channelPlatformEnum } from "@/server/db/schema";
import { ContentService } from "@/server/services/content.service";
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

export const createIdea = defineCapability({
  name: "createIdea",
  description:
    "Create a new content idea — a draft on the /app/content board — for one of the org's brands. Optionally seed the editorial brief (hook, captionDirection, ctaText, pillar, plannedAt) and fan it out to channels (instagram, tiktok, x, facebook, youtube, threads, pinterest, linkedin) as spots. This WRITES to the workspace, so treat it as a proposal: gather the essentials (which brand, a title, ideally a hook + channels), reflect the idea back in one line, and only call this once the operator agrees — the call also surfaces an approval card to confirm. If you don't already have a brandId, call listBrands first. An idea can start from anything the operator gives you (a hook, a theme, a pasted snippet) — turn that into the fields.",
  inputSchema: z.object({
    brandId: z.string().describe("The brand to create under (id from listBrands)."),
    title: z.string().min(1).describe("Short, scannable idea title."),
    hook: z.string().optional().describe("The scroll-stopping first line."),
    captionDirection: z
      .string()
      .optional()
      .describe("Caption / copy direction for the spots — a brief, not the final caption."),
    ctaText: z.string().optional().describe("The call to action."),
    pillar: z.string().optional().describe("Content pillar slug, if known."),
    plannedAt: z
      .string()
      .optional()
      .describe("Planned date on the calendar, ISO 8601."),
    platforms: z
      .array(z.enum(channelPlatformEnum.enumValues))
      .optional()
      .describe("Channels to fan the idea out to as spots."),
  }),
  readOnly: false,
  domain: "content",
  execute: async (input, ctx) => {
    // Auth at the edge: the brand must belong to the caller's org.
    const brand = await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.id, input.brandId),
        eq(brandTable.organizationId, ctx.orgId),
        isNull(brandTable.deletedAt),
      ),
      columns: { id: true, name: true },
    });
    if (!brand) {
      return {
        error:
          "That brand isn't in your organization (or doesn't exist). Call listBrands to get a valid brandId.",
      };
    }

    const { id } = await ContentService.createIdea({
      brandId: brand.id,
      title: input.title,
      hook: input.hook,
      captionDirection: input.captionDirection,
      ctaText: input.ctaText,
      pillar: input.pillar,
      plannedAt: input.plannedAt,
      platforms: input.platforms,
      ownerId: ctx.userId,
      createdById: ctx.userId,
    });

    return {
      ok: true as const,
      id,
      title: input.title,
      brandName: brand.name,
      platforms: input.platforms ?? [],
      url: id ? `/app/content/${id}` : null,
    };
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
