import type { Database } from "@/server/db";
import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  brandTable,
  channelPlatformEnum,
  contentAssigneeTable,
  contentCommentTable,
  contentPostTable,
  contentStatusEnum,
  contentSuggestionTable,
  memberTable,
  platformPostTable,
  seriesTable,
} from "@/server/db/schema";
import {
  archetypeForFormat,
  platformFormatsFor,
} from "@/server/content/formats";
import { ContentService } from "@/server/services/content.service";
import { generateSpotCaption } from "@/server/services/spot-generate.service";
import { SPOT_PILL_IDS } from "@/lib/spot-pills";
import { displayPoster } from "@/lib/utils/media";
import {
  deliverLinkedInPost,
  refreshLinkedInDelivery,
} from "@/server/services/content-publishing.service";
import { resolveGroupingSuggestion } from "@/server/services/content-grouping.service";

type Ctx = {
  db: Database;
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
    where: and(
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true },
  });
  return { org, brands };
}

/**
 * Ownership is org-scoped, not admin-gated: anyone in the org can (re)assign
 * any piece, and `ownerId === self` is the self-assign path. This resolves the
 * org behind a content_post / platform_post and asserts the caller is a member.
 */
async function assertOrgMember(ctx: Ctx, orgId: string | null | undefined) {
  const membership = orgId
    ? await ctx.db.query.memberTable.findFirst({
        where: and(
          eq(memberTable.userId, ctx.session.user.id),
          eq(memberTable.organizationId, orgId),
        ),
      })
    : null;
  if (!orgId || !membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No access to this content",
    });
  }
}

/** The minimal person shape every assignment surface renders (avatar + name). */
export type Member = { id: string; name: string | null; image: string | null };
const toMember = (
  u:
    | { id: string; name: string | null; image: string | null }
    | null
    | undefined,
): Member | null => (u ? { id: u.id, name: u.name, image: u.image } : null);

const statusEnum = z.enum(contentStatusEnum.enumValues);
const mediaItemInput = z.object({
  url: z.string().max(2000),
  type: z.enum(["image", "video", "carousel"]),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  thumbnail: z.string().max(2000).optional(),
  assetId: z.string().optional(),
  derivedFrom: z.string().optional(),
});

export const contentRouter = createTRPCRouter({
  /**
   * Lightweight, org-scoped index for the global command palette. This stays
   * deliberately smaller than `board`: no comments, analytics, media, or
   * assignee joins. cmdk filters these rows client-side after the palette opens.
   */
  searchIndex: protectedProcedure.query(async ({ ctx }) => {
    const { org, brands } = await orgContext(ctx);
    if (!org) return { ideas: [], posts: [] };
    const brandIds = brands.map((brand) => brand.id);
    if (!brandIds.length) return { ideas: [], posts: [] };
    const brandName = new Map(brands.map((brand) => [brand.id, brand.name]));

    const [ideas, posts] = await Promise.all([
      ctx.db.query.contentPostTable.findMany({
        where: and(
          inArray(contentPostTable.brandId, brandIds),
          isNull(contentPostTable.deletedAt),
        ),
        columns: {
          id: true,
          brandId: true,
          title: true,
          hook: true,
          pillar: true,
          status: true,
          updatedAt: true,
        },
        with: {
          series: { columns: { name: true } },
        },
        orderBy: [desc(contentPostTable.updatedAt)],
      }),
      ctx.db.query.platformPostTable.findMany({
        where: and(
          inArray(platformPostTable.brandId, brandIds),
          eq(platformPostTable.source, "owned"),
        ),
        columns: {
          id: true,
          brandId: true,
          contentPostId: true,
          platform: true,
          format: true,
          status: true,
          text: true,
          updatedAt: true,
        },
        with: {
          contentPost: {
            columns: { id: true, title: true, deletedAt: true },
          },
        },
        orderBy: [desc(platformPostTable.updatedAt)],
      }),
    ]);

    return {
      ideas: ideas.map((idea) => ({
        id: idea.id,
        title: idea.title ?? "Untitled idea",
        hook: idea.hook,
        pillar: idea.pillar,
        seriesName: idea.series?.name ?? null,
        status: idea.status,
        brandName: brandName.get(idea.brandId) ?? "—",
        href: `/app/content/${idea.id}`,
      })),
      posts: posts
        .filter(
          (post) =>
            post.contentPostId &&
            post.contentPost &&
            !post.contentPost.deletedAt,
        )
        .map((post) => ({
          id: post.id,
          title: post.contentPost?.title ?? "Untitled idea",
          text: post.text,
          platform: post.platform,
          format: post.format,
          status: post.status,
          brandName: brandName.get(post.brandId) ?? "—",
          href: `/app/content/${post.contentPostId}#post-${post.id}`,
        })),
    };
  }),

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
      if (input.brandId)
        brandIds = brandIds.filter((id) => id === input.brandId);
      if (!brandIds.length) return [];

      const memberCols = { id: true, name: true, image: true } as const;
      const posts = await ctx.db.query.contentPostTable.findMany({
        where: and(
          inArray(contentPostTable.brandId, brandIds),
          isNull(contentPostTable.deletedAt),
          input.pillar ? eq(contentPostTable.pillar, input.pillar) : undefined,
        ),
        with: {
          platformPosts: { with: { owner: { columns: memberCols } } },
          series: true,
          owner: { columns: memberCols },
          assignees: { with: { user: { columns: memberCols } } },
        },
        orderBy: [desc(contentPostTable.updatedAt)],
      });
      const brandName = new Map(brands.map((b) => [b.id, b.name]));

      // Comment count + latest preview per idea (powers the List comment chip
      // + hover tooltip without a per-row fetch).
      const postIds = posts.map((p) => p.id);
      const comments = postIds.length
        ? await ctx.db.query.contentCommentTable.findMany({
            where: and(
              inArray(contentCommentTable.contentPostId, postIds),
              isNull(contentCommentTable.deletedAt),
            ),
            columns: { contentPostId: true, body: true, createdAt: true },
            with: { author: { columns: { name: true } } },
            orderBy: [desc(contentCommentTable.createdAt)],
          })
        : [];
      type LastComment = { author: string | null; body: string; at: string };
      const commentAgg = new Map<
        string,
        { count: number; last: LastComment | null }
      >();
      for (const cm of comments) {
        if (!cm.contentPostId) continue;
        const e = commentAgg.get(cm.contentPostId) ?? { count: 0, last: null };
        e.count++;
        if (!e.last)
          e.last = {
            author: cm.author?.name ?? null,
            body: cm.body.slice(0, 120),
            at: cm.createdAt.toISOString(),
          };
        commentAgg.set(cm.contentPostId, e);
      }

      return posts.map((c) => {
        const platforms = [
          ...new Set(
            c.platformPosts.map((p) =>
              p.format === "newsletter.blast" ? "blast" : p.platform,
            ),
          ),
        ];
        const totals = c.platformPosts.reduce(
          (acc, p) => {
            const s = p.stats ?? {};
            acc.likes += s.likes ?? 0;
            acc.views += s.views ?? 0;
            return acc;
          },
          { likes: 0, views: 0 },
        );
        // Distinct spot owners (the avatar-stack over the platform-icon row).
        const spotOwners = [
          ...new Map<string, Member>(
            c.platformPosts
              .map((p) => p.owner)
              .filter((o): o is NonNullable<typeof o> => !!o)
              .map((o) => [o.id, { id: o.id, name: o.name, image: o.image }]),
          ).values(),
        ];
        // Card thumbnail: the idea's pool image, else the first spot with media.
        const mediaUrl =
          displayPoster(c.media) ??
          c.platformPosts
            .map((p) => displayPoster(p.media))
            .find((u): u is string => !!u) ??
          null;
        return {
          id: c.id,
          title: c.title,
          brandId: c.brandId,
          brandName: brandName.get(c.brandId) ?? "—",
          pillar: c.pillar,
          mediaUrl,
          seriesName: c.series?.name ?? null,
          seriesColor: c.series?.color ?? null,
          status: c.status,
          origin: c.origin,
          hook: c.hook,
          platforms,
          postCount: c.platformPosts.length,
          likes: totals.likes,
          views: totals.views,
          plannedAt: c.plannedAt ? c.plannedAt.toISOString() : null,
          owner: toMember(c.owner),
          assignees: c.assignees
            .map((a) => toMember(a.user))
            .filter((m): m is Member => m !== null),
          spotOwners,
          commentCount: commentAgg.get(c.id)?.count ?? 0,
          lastComment: commentAgg.get(c.id)?.last ?? null,
        };
      });
    }),

  /**
   * Date-first posting schedule: one row per OWNED platform spot, placed on its
   * effective ship day (scheduled ?? published ?? idea plan date). This is the
   * manual posting worklist — what goes out, on which channel, on which day.
   */
  schedule: protectedProcedure
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
      if (input.brandId)
        brandIds = brandIds.filter((id) => id === input.brandId);
      if (!brandIds.length) return [];

      const memberCols = { id: true, name: true, image: true } as const;
      const spots = await ctx.db.query.platformPostTable.findMany({
        where: and(
          inArray(platformPostTable.brandId, brandIds),
          eq(platformPostTable.source, "owned"),
        ),
        with: {
          contentPost: {
            with: { series: true, owner: { columns: memberCols } },
          },
          owner: { columns: memberCols },
        },
      });
      const brandName = new Map(brands.map((b) => [b.id, b.name]));

      return spots
        .filter((p) => p.contentPost && !p.contentPost.deletedAt)
        .filter((p) =>
          input.pillar ? p.contentPost?.pillar === input.pillar : true,
        )
        .map((p) => {
          const at =
            p.scheduledAt ?? p.publishedAt ?? p.contentPost?.plannedAt ?? null;
          return {
            id: p.id,
            contentPostId: p.contentPostId,
            title: p.contentPost?.title ?? null,
            platform: p.platform,
            format: p.format,
            status: p.status,
            pillar: p.contentPost?.pillar ?? null,
            seriesName: p.contentPost?.series?.name ?? null,
            seriesColor: p.contentPost?.series?.color ?? null,
            brandName: brandName.get(p.brandId) ?? "—",
            at: at ? at.toISOString() : null,
            owner: toMember(p.contentPost?.owner) ?? toMember(p.owner),
            spotOwner: toMember(p.owner),
            // Everything the team needs to post by hand: copyable brief + assets.
            hook: p.contentPost?.hook ?? null,
            caption: p.contentPost?.captionDirection ?? null,
            cta: p.contentPost?.ctaText ?? null,
            assetLinks: p.assetLinks ?? null,
            mediaUrl: displayPoster(p.media),
            externalUrl: p.externalUrl ?? null,
          };
        });
    }),

  /**
   * The "Sheet" view — a wide, date-first rendering of the team's old Google-
   * Sheet content calendar. One row per IDEA, every editorial column in the
   * sheet's order, grouped into month "workbooks" client-side. READ-ONLY mirror
   * (no writes here; the row links to the detail page for edits) over the same
   * data the board/schedule already expose — just the full column run in one
   * shape, so nothing from the spreadsheet feels lost. Effective date = idea
   * plan date, else the earliest spot ship date; undated ideas are dropped
   * (the month workbooks are date-driven).
   */
  grid: protectedProcedure
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
      if (input.brandId)
        brandIds = brandIds.filter((id) => id === input.brandId);
      if (!brandIds.length) return [];

      const memberCols = { id: true, name: true, image: true } as const;
      const posts = await ctx.db.query.contentPostTable.findMany({
        where: and(
          inArray(contentPostTable.brandId, brandIds),
          isNull(contentPostTable.deletedAt),
          input.pillar ? eq(contentPostTable.pillar, input.pillar) : undefined,
        ),
        with: {
          platformPosts: true,
          series: true,
          owner: { columns: memberCols },
        },
      });
      const brandName = new Map(brands.map((b) => [b.id, b.name]));

      return posts
        .map((c) => {
          // Effective publish date: idea plan date, else earliest spot date.
          const earliestSpot = c.platformPosts
            .map((p) => p.scheduledAt ?? p.publishedAt)
            .filter((d): d is Date => !!d)
            .sort((a, b) => a.getTime() - b.getTime())[0];
          const at = c.plannedAt ?? earliestSpot ?? null;

          // Spot-level columns are aggregated across the idea's renderings.
          const platforms = [
            ...new Set(c.platformPosts.map((p) => p.platform)),
          ];
          const formats = [
            ...new Set(
              c.platformPosts
                .map((p) => p.format ?? p.archetype)
                .filter((f): f is string => !!f),
            ),
          ];
          const assetLinks = [
            ...new Set(c.platformPosts.flatMap((p) => p.assetLinks ?? [])),
          ];
          const links = [
            ...new Set(
              c.platformPosts
                .map((p) => p.externalUrl)
                .filter((u): u is string => !!u),
            ),
          ];

          return {
            id: c.id,
            at: at ? at.toISOString() : null,
            platforms,
            pillar: c.pillar,
            seriesName: c.series?.name ?? null,
            seriesColor: c.series?.color ?? null,
            title: c.title,
            formats,
            hook: c.hook,
            captionDirection: c.captionDirection,
            visualDirection: c.visualDirection,
            ctaText: c.ctaText,
            ctaKeyword: c.ctaKeyword,
            kpi: c.kpi,
            owner: toMember(c.owner),
            status: c.status,
            assetLinks,
            links,
            brandName: brandName.get(c.brandId) ?? "—",
          };
        })
        .filter((r): r is typeof r & { at: string } => r.at !== null)
        .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
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
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No access to this content",
        });
      }

      await ContentService.setContentStatus({
        contentPostId: input.id,
        status: input.status,
      });
      return { id: input.id, status: input.status };
    }),

  /** Org roster for the assignee picker — everyone who can own a piece/spot. */
  assignableMembers: protectedProcedure.query(
    async ({ ctx }): Promise<Member[]> => {
      const { org } = await orgContext(ctx);
      if (!org) return [];
      const members = await ctx.db.query.memberTable.findMany({
        where: eq(memberTable.organizationId, org.id),
        with: { user: { columns: { id: true, name: true, image: true } } },
      });
      return members
        .map((m) => toMember(m.user))
        .filter((m): m is Member => m !== null)
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    },
  ),

  /**
   * Assign / clear the idea-level owner (DRI). `ownerId: null` disowns.
   * Self-assign is just `ownerId === session.user.id`; no admin gate.
   */
  setOwner: protectedProcedure
    .input(
      z.object({ contentPostId: z.string(), ownerId: z.string().nullable() }),
    )
    .mutation(async ({ ctx, input }) => {
      const content = await ctx.db.query.contentPostTable.findFirst({
        where: eq(contentPostTable.id, input.contentPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!content) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, content.brand?.organizationId);

      await ctx.db
        .update(contentPostTable)
        .set({ ownerId: input.ownerId })
        .where(eq(contentPostTable.id, input.contentPostId));
      return { id: input.contentPostId, ownerId: input.ownerId };
    }),

  /**
   * Replace the set of collaborators on an idea (beyond the lead `ownerId`).
   * Designer + copywriter + approver, etc. Idempotent: pass the full list.
   */
  setAssignees: protectedProcedure
    .input(
      z.object({ contentPostId: z.string(), userIds: z.array(z.string()) }),
    )
    .mutation(async ({ ctx, input }) => {
      const content = await ctx.db.query.contentPostTable.findFirst({
        where: eq(contentPostTable.id, input.contentPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!content) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, content.brand?.organizationId);

      const ids = [...new Set(input.userIds)];
      await ctx.db
        .delete(contentAssigneeTable)
        .where(eq(contentAssigneeTable.contentPostId, input.contentPostId));
      if (ids.length) {
        await ctx.db.insert(contentAssigneeTable).values(
          ids.map((userId) => ({
            contentPostId: input.contentPostId,
            userId,
          })),
        );
      }
      return { id: input.contentPostId, userIds: ids };
    }),

  /**
   * Assign / clear a per-spot owner (`platform_post.ownerId`) — channel access
   * differs per person, so a spot can be owned independently of the idea.
   */
  setSpotOwner: protectedProcedure
    .input(
      z.object({ platformPostId: z.string(), ownerId: z.string().nullable() }),
    )
    .mutation(async ({ ctx, input }) => {
      const spot = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.platformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!spot) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, spot.brand?.organizationId);

      await ctx.db
        .update(platformPostTable)
        .set({ ownerId: input.ownerId })
        .where(eq(platformPostTable.id, input.platformPostId));
      return { id: input.platformPostId, ownerId: input.ownerId };
    }),

  /**
   * Move a single platform spot through its own status — channels ship on
   * different days, so a spot's status is independent of the idea's. Owned
   * spots only; scraped posts are historical record.
   */
  setSpotStatus: protectedProcedure
    .input(z.object({ platformPostId: z.string(), status: statusEnum }))
    .mutation(async ({ ctx, input }) => {
      const spot = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.platformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!spot) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, spot.brand?.organizationId);
      if (spot.source !== "owned") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Can't edit a scraped post",
        });
      }
      await ContentService.updatePlatformDraft({
        platformPostId: input.platformPostId,
        status: input.status,
      });
      return { id: input.platformPostId, status: input.status };
    }),

  /**
   * Manually set a spot's scheduled ship date (the "manual layer" until
   * auto-publish exists — the team picks the day each channel goes out).
   */
  setSpotSchedule: protectedProcedure
    .input(
      z.object({
        platformPostId: z.string(),
        scheduledAt: z.string().datetime().nullable(),
        // Also move the spot to `scheduled` — the "she queued it natively on
        // the platform" hot action. Off for plain reschedules (calendar drag),
        // which shouldn't silently promote a draft.
        markScheduled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const spot = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.platformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!spot) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, spot.brand?.organizationId);
      if (spot.source !== "owned") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Can't edit a scraped post",
        });
      }
      await ContentService.updatePlatformDraft({
        platformPostId: input.platformPostId,
        scheduledAt: input.scheduledAt,
        markScheduled: input.markScheduled,
      });
      return { id: input.platformPostId };
    }),

  /** Approval-gated LinkedIn-first publishing spike. The same Zernio endpoint
   * handles future scheduling and publish-now; delivery state is persisted on
   * the platform post so a later refresh/webhook can close the loop. */
  deliverLinkedIn: protectedProcedure
    .input(
      z.object({
        platformPostId: z.string(),
        mode: z.enum(["schedule", "publish_now"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const spot = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.platformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!spot) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, spot.brand?.organizationId);
      try {
        return await deliverLinkedInPost(input);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Could not publish",
        });
      }
    }),

  refreshLinkedInDelivery: protectedProcedure
    .input(z.object({ platformPostId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const spot = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.platformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!spot) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, spot.brand?.organizationId);
      try {
        return await refreshLinkedInDelivery(input.platformPostId);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Could not refresh delivery",
        });
      }
    }),

  /** Edit the Drive/external link list on a spot (the team's asset workflow). */
  setAssetLinks: protectedProcedure
    .input(
      z.object({
        platformPostId: z.string(),
        assetLinks: z.array(z.string().trim().min(1).max(2000)).max(30),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const spot = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.platformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!spot) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, spot.brand?.organizationId);
      if (spot.source !== "owned") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Can't edit a scraped post",
        });
      }
      await ctx.db
        .update(platformPostTable)
        .set({ assetLinks: input.assetLinks.length ? input.assetLinks : null })
        .where(eq(platformPostTable.id, input.platformPostId));
      return { id: input.platformPostId };
    }),

  /** Attach hosted media (Blob library assets) to a spot. `assetId` links
   *  each item back to the media library; uploaded via the media router. */
  setMedia: protectedProcedure
    .input(
      z.object({
        platformPostId: z.string(),
        media: z.array(mediaItemInput).max(300),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const spot = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.platformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!spot) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, spot.brand?.organizationId);
      if (spot.source !== "owned") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Can't edit a scraped post",
        });
      }
      return ContentService.setSpotMedia(input);
    }),

  /** Save the complete manual post editor against the version it opened from. */
  saveSpotEditor: protectedProcedure
    .input(
      z.object({
        platformPostId: z.string(),
        expectedUpdatedAt: z.string().datetime(),
        text: z.string().max(5000).nullable(),
        media: z.array(mediaItemInput).max(300),
        assetLinks: z.array(z.string().trim().min(1).max(2000)).max(30),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const spot = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.platformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!spot) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, spot.brand?.organizationId);
      if (spot.source !== "owned") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Can't edit a scraped post",
        });
      }

      const saved = await ContentService.saveSpotEditor(input);
      if (!saved) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This post changed while you were editing. Close and reopen the editor to review the latest version.",
        });
      }
      return saved;
    }),

  /** Set a spot's concrete, platform-specific caption (`platform_post.text`) —
   *  distinct from the idea-level `captionDirection` brief. */
  setSpotText: protectedProcedure
    .input(
      z.object({
        platformPostId: z.string(),
        text: z.string().max(5000).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const spot = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.platformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!spot) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, spot.brand?.organizationId);
      if (spot.source !== "owned") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Can't edit a scraped post",
        });
      }
      const text = input.text?.trim() ? input.text : null;
      return ContentService.setSpotText({
        platformPostId: input.platformPostId,
        text,
      });
    }),

  /** AI-remix the idea brief into a platform-ready caption in the composed
   *  brand+channel voice (fingerprint), with optional pills / free-text steer.
   *  Side-effect-free — returns the draft; the client persists via setSpotText. */
  generateSpotCaption: protectedProcedure
    .input(
      z.object({
        platformPostId: z.string(),
        pills: z.array(z.enum(SPOT_PILL_IDS)).max(8).optional(),
        steer: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const spot = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.platformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!spot) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, spot.brand?.organizationId);
      if (spot.source !== "owned") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Can't generate for a scraped post",
        });
      }
      return generateSpotCaption(input);
    }),

  /** Set the content-level media POOL (`content_post.media`). The pool VIEW is
   *  the union of this + every spot's media; this stores the idea-level adds. */
  setPoolMedia: protectedProcedure
    .input(
      z.object({
        contentPostId: z.string(),
        media: z
          .array(
            z.object({
              url: z.string().max(2000),
              type: z.enum(["image", "video", "carousel"]),
              width: z.number().int().positive().optional(),
              height: z.number().int().positive().optional(),
              thumbnail: z.string().max(2000).optional(),
              assetId: z.string().optional(),
              derivedFrom: z.string().optional(),
            }),
          )
          .max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const content = await ctx.db.query.contentPostTable.findFirst({
        where: eq(contentPostTable.id, input.contentPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!content) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, content.brand?.organizationId);
      return ContentService.setPoolMedia({
        contentPostId: input.contentPostId,
        media: input.media,
      });
    }),

  /**
   * Capture a new idea (the List's inline "+ Add idea"). Minimal by design —
   * title + where it sits; the brief gets filled in on the detail screen.
   */
  create: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        title: z.string().trim().min(1),
        pillar: z.string().optional(),
        seriesId: z.string().optional(),
        plannedAt: z.string().datetime().optional(),
        // Editorial brief — written once at the idea level (see content_post).
        hook: z.string().optional(),
        captionDirection: z.string().optional(),
        visualDirection: z.string().optional(),
        ctaText: z.string().optional(),
        ctaKeyword: z.string().optional(),
        kpi: z.string().optional(),
        // Channels to fan out to immediately, as owned spots.
        platforms: z.array(z.enum(channelPlatformEnum.enumValues)).optional(),
        spots: z
          .array(
            z.object({
              platform: z.enum(channelPlatformEnum.enumValues),
              format: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const brand = await ctx.db.query.brandTable.findFirst({
        where: eq(brandTable.id, input.brandId),
        columns: { organizationId: true },
      });
      if (!brand) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, brand.organizationId);

      return ContentService.createIdea({
        ...input,
        ownerId: ctx.session.user.id,
        createdById: ctx.session.user.id,
      });
    }),

  /**
   * Start with one native channel draft. Unlike `create`, this deliberately
   * leaves contentPostId null until the operator decides the post deserves a
   * canonical idea, cross-posts, a grouping, or a series.
   */
  createPlatformPost: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        platform: z.enum(channelPlatformEnum.enumValues),
        title: z.string().trim().min(1).optional(),
        text: z.string().max(10_000).optional(),
        pillar: z.string().optional(),
        scheduledAt: z.string().datetime().optional(),
        format: z.string().optional(),
        referencePlatformPostId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const brand = await ctx.db.query.brandTable.findFirst({
        where: eq(brandTable.id, input.brandId),
        columns: { organizationId: true },
      });
      if (!brand) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, brand.organizationId);

      if (input.referencePlatformPostId) {
        const reference = await ctx.db.query.platformPostTable.findFirst({
          where: eq(platformPostTable.id, input.referencePlatformPostId),
          columns: { id: true },
        });
        if (!reference) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Reference platform post not found",
          });
        }
      }

      return ContentService.createPlatformPost({
        ...input,
        ownerId: ctx.session.user.id,
      });
    }),

  /** Lift one platform-first draft/history item into the canonical idea layer. */
  promotePlatformPost: protectedProcedure
    .input(
      z.object({
        platformPostId: z.string(),
        title: z.string().trim().min(1).optional(),
        pillar: z.string().nullable().optional(),
        seriesId: z.string().nullable().optional(),
        crossPostPlatforms: z
          .array(z.enum(channelPlatformEnum.enumValues))
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const post = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.platformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!post) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, post.brand?.organizationId);
      return ContentService.promotePlatformPost({
        ...input,
        ownerId: ctx.session.user.id,
        createdById: ctx.session.user.id,
      });
    }),

  /**
   * Edit the idea-level editorial brief (the sheet's hook/caption/CTA/KPI
   * columns) plus title / pillar / series / plan date. Partial — only the
   * provided keys are written.
   */
  updateBrief: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().trim().min(1).optional(),
        hook: z.string().nullable().optional(),
        captionDirection: z.string().nullable().optional(),
        visualDirection: z.string().nullable().optional(),
        ctaText: z.string().nullable().optional(),
        ctaKeyword: z.string().nullable().optional(),
        kpi: z.string().nullable().optional(),
        pillar: z.string().nullable().optional(),
        seriesId: z.string().nullable().optional(),
        plannedAt: z.string().datetime().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const content = await ctx.db.query.contentPostTable.findFirst({
        where: eq(contentPostTable.id, input.id),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!content) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, content.brand?.organizationId);

      return ContentService.updateBrief(input);
    }),

  /**
   * Fan an idea out to another channel — the "break into cross-posts" action.
   * Creates an owned `platform_post` spot inheriting the idea's status; format
   * defaults to the platform's primary product when not specified.
   */
  addSpot: protectedProcedure
    .input(
      z.object({
        contentPostId: z.string(),
        platform: z.enum(channelPlatformEnum.enumValues),
        format: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const content = await ctx.db.query.contentPostTable.findFirst({
        where: eq(contentPostTable.id, input.contentPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!content) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, content.brand?.organizationId);

      const format = input.format ?? platformFormatsFor(input.platform)[0]?.id;
      const [row] = await ctx.db
        .insert(platformPostTable)
        .values({
          brandId: content.brandId,
          contentPostId: input.contentPostId,
          platform: input.platform,
          format,
          archetype: format ? archetypeForFormat(format) : undefined,
          source: "owned",
          status: content.status,
          origin: "human",
        })
        .returning({ id: platformPostTable.id });
      return { id: row?.id };
    }),

  /** Remove an owned spot from an idea (cross-post undo). Scraped spots are
   *  off-limits — those are historical record, not editable plan. */
  removeSpot: protectedProcedure
    .input(z.object({ platformPostId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const spot = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.platformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!spot) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, spot.brand?.organizationId);
      if (spot.source !== "owned") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Can't remove a scraped post",
        });
      }
      await ctx.db
        .delete(platformPostTable)
        .where(eq(platformPostTable.id, input.platformPostId));
      return { id: input.platformPostId };
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
      pillarSlug?: string | null;
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
        pillarSlug: p.pillarSlug ?? null,
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
      const { org } = await orgContext(ctx);
      if (!org) throw new TRPCError({ code: "FORBIDDEN" });
      return resolveGroupingSuggestion({
        id: input.id,
        accept: input.accept,
        orgId: org.id,
        userId: ctx.session.user.id,
      });
    }),

  /**
   * Manually group selected platform_posts into one content_post idea — the
   * "send a Feed/Timeline selection to a grouping" path (human counterpart to
   * the AI `groupingSuggestions` flow). `single` makes one idea whose members
   * are renderings/amplifications; `series` makes a series + one idea per post.
   */
  createGrouping: protectedProcedure
    .input(
      z.object({
        platformPostIds: z.array(z.string()).min(1),
        title: z.string().trim().min(1).optional(),
        unit: z.enum(["single", "series"]).default("single"),
        theme: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { org, brands } = await orgContext(ctx);
      if (!org) throw new TRPCError({ code: "FORBIDDEN" });
      const ownedIds = new Set(brands.map((b) => b.id));

      const posts = await ctx.db.query.platformPostTable.findMany({
        where: inArray(platformPostTable.id, input.platformPostIds),
        columns: { id: true, brandId: true, text: true, publishedAt: true },
      });
      if (!posts.length) throw new TRPCError({ code: "NOT_FOUND" });
      // The grouping must touch at least one brand the caller owns.
      if (!posts.some((p) => ownedIds.has(p.brandId))) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Idea is per-brand; anchor it to an owned brand among the selection.
      const brandId = posts.find((p) => ownedIds.has(p.brandId))!.brandId;

      if (input.unit === "series") {
        const dates = posts
          .map((p) => p.publishedAt)
          .filter((d): d is Date => !!d)
          .sort((a, b) => a.getTime() - b.getTime());
        const [series] = await ctx.db
          .insert(seriesTable)
          .values({
            brandId,
            name: input.title ?? "Series",
            theme: input.theme,
            status: "active",
            startAt: dates[0],
            endAt: dates[dates.length - 1],
          })
          .returning({ id: seriesTable.id });
        for (const p of posts) {
          const [cp] = await ctx.db
            .insert(contentPostTable)
            .values({
              brandId,
              title: p.text?.slice(0, 100).replace(/\s+/g, " ").trim() ?? null,
              status: "draft",
              origin: "human",
              seriesId: series?.id,
            })
            .returning({ id: contentPostTable.id });
          if (cp) {
            await ctx.db
              .update(platformPostTable)
              .set({ contentPostId: cp.id })
              .where(eq(platformPostTable.id, p.id));
          }
        }
        return { seriesId: series?.id, count: posts.length };
      }

      const [cp] = await ctx.db
        .insert(contentPostTable)
        .values({
          brandId,
          title: input.title ?? "Grouped content",
          status: "draft",
          origin: "human",
          metadata: input.theme ? { theme: input.theme } : undefined,
        })
        .returning({ id: contentPostTable.id });
      if (cp) {
        await ctx.db
          .update(platformPostTable)
          .set({ contentPostId: cp.id })
          .where(inArray(platformPostTable.id, input.platformPostIds));
      }
      return { contentPostId: cp?.id, count: posts.length };
    }),

  // ---- Comments (light per-idea discussion) ----------------------------
  comments: protectedProcedure
    .input(z.object({ contentPostId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.contentCommentTable.findMany({
        where: and(
          eq(contentCommentTable.contentPostId, input.contentPostId),
          isNull(contentCommentTable.deletedAt),
        ),
        with: { author: { columns: { id: true, name: true, image: true } } },
        orderBy: [asc(contentCommentTable.createdAt)],
      });
      return rows.map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        authorId: r.authorId,
        author: toMember(r.author),
      }));
    }),

  addComment: protectedProcedure
    .input(
      z.object({ contentPostId: z.string(), body: z.string().trim().min(1) }),
    )
    .mutation(async ({ ctx, input }) => {
      const content = await ctx.db.query.contentPostTable.findFirst({
        where: eq(contentPostTable.id, input.contentPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!content) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgMember(ctx, content.brand?.organizationId);
      const [row] = await ctx.db
        .insert(contentCommentTable)
        .values({
          contentPostId: input.contentPostId,
          authorId: ctx.session.user.id,
          body: input.body,
        })
        .returning({ id: contentCommentTable.id });
      return { id: row?.id };
    }),

  deleteComment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const c = await ctx.db.query.contentCommentTable.findFirst({
        where: eq(contentCommentTable.id, input.id),
      });
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      if (c.authorId !== ctx.session.user.id)
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your comment" });
      await ctx.db
        .update(contentCommentTable)
        .set({ deletedAt: new Date() })
        .where(eq(contentCommentTable.id, input.id));
      return { id: input.id };
    }),
});
