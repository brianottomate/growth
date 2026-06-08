import { z } from "zod";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  brandTable,
  contentPostTable,
  contentStatusEnum,
  contentSuggestionTable,
  memberTable,
  platformPostTable,
  seriesTable,
} from "@/server/db/schema";
import { displayPoster } from "@/lib/utils/media";

type Ctx = {
  db: typeof import("@/server/db").db;
  session: { user: { id: string } };
};

/** The org the user belongs to + its (owned, non-deleted) brands. */
async function orgContext(ctx: Ctx) {
  const membership = await ctx.db.query.memberTable.findFirst({
    where: eq(memberTable.userId, ctx.session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization ?? null;
  if (!org) return { org: null, brands: [] as { id: string; name: string }[] };
  const brands = await ctx.db.query.brandTable.findMany({
    where: and(eq(brandTable.organizationId, org.id), isNull(brandTable.deletedAt)),
    columns: { id: true, name: true },
  });
  return { org, brands };
}

const statusEnum = z.enum(contentStatusEnum.enumValues);

export const contentRouter = createTRPCRouter({
  /**
   * The editorial pipeline: every content idea across the org's brands, shaped
   * as board cards. The board groups by `status` client-side; this returns a
   * flat list (optionally narrowed by brand / pillar).
   */
  board: protectedProcedure
    .input(
      z.object({
        brandId: z.string().optional(),
        pillar: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { org, brands } = await orgContext(ctx);
      if (!org) return [];

      let brandIds = brands.map((b) => b.id);
      if (input.brandId) brandIds = brandIds.filter((id) => id === input.brandId);
      if (!brandIds.length) return [];

      const posts = await ctx.db.query.contentPostTable.findMany({
        where: and(
          inArray(contentPostTable.brandId, brandIds),
          isNull(contentPostTable.deletedAt),
          input.pillar ? eq(contentPostTable.pillar, input.pillar) : undefined,
        ),
        with: { platformPosts: true, series: true },
        orderBy: [desc(contentPostTable.updatedAt)],
      });
      const brandName = new Map(brands.map((b) => [b.id, b.name]));

      return posts.map((c) => {
        const platforms = [...new Set(c.platformPosts.map((p) => p.platform))];
        const totals = c.platformPosts.reduce(
          (acc, p) => {
            const s = p.stats ?? {};
            acc.likes += s.likes ?? 0;
            acc.views += s.views ?? 0;
            return acc;
          },
          { likes: 0, views: 0 },
        );
        return {
          id: c.id,
          title: c.title,
          brandId: c.brandId,
          brandName: brandName.get(c.brandId) ?? "—",
          pillar: c.pillar,
          seriesName: c.series?.name ?? null,
          seriesColor: c.series?.color ?? null,
          status: c.status,
          origin: c.origin,
          platforms,
          postCount: c.platformPosts.length,
          likes: totals.likes,
          views: totals.views,
          plannedAt: c.plannedAt ? c.plannedAt.toISOString() : null,
        };
      });
    }),

  /** Move a content idea to a new lifecycle status (the Kanban drag target). */
  setStatus: protectedProcedure
    .input(z.object({ id: z.string(), status: statusEnum }))
    .mutation(async ({ ctx, input }) => {
      const content = await ctx.db.query.contentPostTable.findFirst({
        where: eq(contentPostTable.id, input.id),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!content) throw new TRPCError({ code: "NOT_FOUND" });

      const orgId = content.brand?.organizationId;
      const membership = orgId
        ? await ctx.db.query.memberTable.findFirst({
            where: and(
              eq(memberTable.userId, ctx.session.user.id),
              eq(memberTable.organizationId, orgId),
            ),
          })
        : null;
      if (!orgId || !membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No access to this content" });
      }

      await ctx.db
        .update(contentPostTable)
        .set({ status: input.status })
        .where(eq(contentPostTable.id, input.id));

      return { id: input.id, status: input.status };
    }),

  /**
   * Pending AI-proposed groupings (retroactive content_post reconstruction)
   * for review in /content/groupings. Hydrates each group's member posts.
   */
  groupingSuggestions: protectedProcedure.query(async ({ ctx }) => {
    const { org, brands } = await orgContext(ctx);
    if (!org) return [];
    const brandIds = brands.map((b) => b.id);
    if (!brandIds.length) return [];

    const sugs = await ctx.db.query.contentSuggestionTable.findMany({
      where: and(
        eq(contentSuggestionTable.kind, "grouping"),
        eq(contentSuggestionTable.status, "pending"),
        inArray(contentSuggestionTable.brandId, brandIds),
      ),
      orderBy: [desc(contentSuggestionTable.confidence)],
    });

    type Proposed = {
      unit?: string;
      title?: string;
      groupKind?: string;
      theme?: string;
      memberPostIds?: string[];
      rationale?: string;
    };
    const memberIds = [
      ...new Set(
        sugs.flatMap((s) => (s.proposed as Proposed)?.memberPostIds ?? []),
      ),
    ];
    const members = memberIds.length
      ? await ctx.db.query.platformPostTable.findMany({
          where: inArray(platformPostTable.id, memberIds),
          columns: {
            id: true,
            platform: true,
            text: true,
            media: true,
            publishedAt: true,
            externalUrl: true,
            externalKind: true,
            parentPlatformPostId: true,
          },
        })
      : [];
    const mById = new Map(members.map((m) => [m.id, m]));
    const brandName = new Map(brands.map((b) => [b.id, b.name]));

    return sugs.map((s) => {
      const p = (s.proposed ?? {}) as Proposed;
      const ids = p.memberPostIds ?? [];
      return {
        id: s.id,
        brandId: s.brandId,
        brandName: brandName.get(s.brandId) ?? "—",
        unit: p.unit ?? "single",
        title: p.title ?? "Group",
        groupKind: p.groupKind ?? "group",
        theme: p.theme ?? null,
        rationale: s.reasoning,
        confidence: s.confidence,
        members: ids
          .map((id) => {
            const m = mById.get(id);
            return m
              ? {
                  id: m.id,
                  platform: m.platform,
                  text: m.text?.slice(0, 140) ?? null,
                  mediaUrl: displayPoster(m.media),
                  at: m.publishedAt?.toISOString() ?? null,
                  externalUrl: m.externalUrl ?? null,
                  externalKind: m.externalKind ?? null,
                  parentId: m.parentPlatformPostId ?? null,
                }
              : null;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null),
      };
    });
  }),

  /** Accept a grouping → create the content_post idea + link its members.
   *  Reject → mark it rejected so re-runs don't re-propose it. */
  resolveGrouping: protectedProcedure
    .input(z.object({ id: z.string(), accept: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const sug = await ctx.db.query.contentSuggestionTable.findFirst({
        where: eq(contentSuggestionTable.id, input.id),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!sug) throw new TRPCError({ code: "NOT_FOUND" });

      const orgId = sug.brand?.organizationId;
      const membership = orgId
        ? await ctx.db.query.memberTable.findFirst({
            where: and(
              eq(memberTable.userId, ctx.session.user.id),
              eq(memberTable.organizationId, orgId),
            ),
          })
        : null;
      if (!orgId || !membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const review = { reviewedById: ctx.session.user.id, reviewedAt: new Date() };

      if (!input.accept) {
        await ctx.db
          .update(contentSuggestionTable)
          .set({ status: "rejected", ...review })
          .where(eq(contentSuggestionTable.id, input.id));
        return { id: input.id, status: "rejected" as const };
      }

      const p = (sug.proposed ?? {}) as {
        unit?: string;
        title?: string;
        groupKind?: string;
        theme?: string;
        memberPostIds?: string[];
      };
      const ids = p.memberPostIds ?? [];

      if (p.unit === "series") {
        // Distinct pieces sharing an arc → a real SERIES (with from→to span)
        // and one content_post per member.
        const members = ids.length
          ? await ctx.db.query.platformPostTable.findMany({
              where: inArray(platformPostTable.id, ids),
              columns: { id: true, text: true, publishedAt: true },
            })
          : [];
        const dates = members
          .map((m) => m.publishedAt)
          .filter((d): d is Date => !!d)
          .sort((a, b) => a.getTime() - b.getTime());

        const [series] = await ctx.db
          .insert(seriesTable)
          .values({
            brandId: sug.brandId,
            name: p.title ?? "Series",
            theme: p.theme,
            status: "active",
            startAt: dates[0],
            endAt: dates[dates.length - 1],
          })
          .returning({ id: seriesTable.id });

        for (const m of members) {
          const [cp] = await ctx.db
            .insert(contentPostTable)
            .values({
              brandId: sug.brandId,
              title: m.text?.slice(0, 100).replace(/\s+/g, " ").trim() ?? null,
              status: "draft",
              origin: "ai",
              seriesId: series?.id,
              metadata: { fromSuggestion: sug.id },
            })
            .returning({ id: contentPostTable.id });
          if (cp) {
            await ctx.db
              .update(platformPostTable)
              .set({ contentPostId: cp.id })
              .where(eq(platformPostTable.id, m.id));
          }
        }

        await ctx.db
          .update(contentSuggestionTable)
          .set({ status: "accepted", ...review })
          .where(eq(contentSuggestionTable.id, input.id));
        return { id: input.id, status: "accepted" as const, seriesId: series?.id };
      }

      // "single": one piece — all members are its renderings/amplifications.
      const [cp] = await ctx.db
        .insert(contentPostTable)
        .values({
          brandId: sug.brandId,
          title: p.title ?? "Grouped content",
          status: "draft",
          origin: "ai",
          metadata: {
            groupKind: p.groupKind,
            theme: p.theme,
            fromSuggestion: sug.id,
          },
        })
        .returning({ id: contentPostTable.id });

      if (cp && ids.length) {
        await ctx.db
          .update(platformPostTable)
          .set({ contentPostId: cp.id })
          .where(inArray(platformPostTable.id, ids));
      }

      await ctx.db
        .update(contentSuggestionTable)
        .set({ status: "accepted", ...review })
        .where(eq(contentSuggestionTable.id, input.id));

      return { id: input.id, status: "accepted" as const, contentPostId: cp?.id };
    }),
});
