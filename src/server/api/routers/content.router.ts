import { z } from "zod";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  brandTable,
  contentPostTable,
  contentStatusEnum,
  memberTable,
} from "@/server/db/schema";

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
});
