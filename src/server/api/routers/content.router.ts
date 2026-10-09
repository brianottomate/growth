import type { Database } from "@/server/db";
import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

import { actionProcedure, protectedProcedure } from "@/server/api/orpc";
import {
  createIdea,
  promotePlatformPost,
  updateContentWorkItem,
} from "@/server/ai/capabilities/content";
import { resolveContentGrouping } from "@/server/ai/capabilities/content-strategy";
import {
  brandTable,
  contentAssigneeTable,
  contentCommentTable,
  contentPostTable,
  contentSuggestionTable,
  memberTable,
  platformPostTable,
  seriesTable,
} from "@/server/db/schema";
import { ContentService } from "@/server/services/content.service";
import { displayPoster } from "@/lib/utils/media";
import { groupPlatformThreads } from "@/lib/platform-thread";
import { platformPostDocumentSchema } from "@/lib/platform-post-document";
import {
  deliverSocialPost,
  refreshSocialDelivery,
  retrySocialDelivery,
} from "@/server/services/content-publishing.service";

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
    throw new ORPCError("FORBIDDEN", { message: "No access to this content" });
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

const mediaItemInput = z.object({
  url: z.string().max(2000),
  type: z.enum(["image", "video", "carousel"]),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  thumbnail: z.string().max(2000).optional(),
  assetId: z.string().optional(),
  derivedFrom: z.string().optional(),
});
const spotThreadItemInput = z.object({
  id: z.string().optional(),
  text: z.string().max(10_000).nullable(),
  textDocument: platformPostDocumentSchema.optional(),
  media: z.array(mediaItemInput).max(300),
  assetLinks: z.array(z.string().trim().min(1).max(2000)).max(30),
});

export const contentRouter = {
  /** Lightweight, org-scoped client index for the global command palette. */
  searchIndex: protectedProcedure.handler(async ({ context: ctx }) => {
    const { org } = await orgContext(ctx);
    if (!org) return { clients: [] };

    const clients = await ctx.db.query.brandTable.findMany({
      where: and(
        eq(brandTable.organizationId, org.id),
        isNull(brandTable.deletedAt),
        inArray(brandTable.relationship, ["client", "prospect"]),
      ),
      columns: {
        id: true,
        name: true,
        slug: true,
        website: true,
        relationship: true,
        businessStage: true,
        deliveryStage: true,
      },
      orderBy: [asc(brandTable.name)],
    });

    return {
      clients: clients.map((client) => ({
        id: client.id,
        name: client.name,
        website: client.website,
        relationship: client.relationship,
        business: client.businessStage,
        delivery: client.deliveryStage,
        href: `/app/performance/clients/${client.slug ?? client.id}`,
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
    .handler(async ({ context: ctx, input }) => {
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
        const platformGroups = groupPlatformThreads(c.platformPosts);
        const platforms = [
          ...new Set(
            c.platformPosts.map((p) =>
              ["newsletter.broadcast", "newsletter.blast"].includes(
                p.format ?? "",
              )
                ? "blast"
                : p.platform,
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
          postCount: platformGroups.length,
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
    .handler(async ({ context: ctx, input }) => {
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
        .filter(
          (p): p is typeof p & { contentPostId: string } =>
            !!p.contentPostId && !!p.contentPost && !p.contentPost.deletedAt,
        )
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
    .handler(async ({ context: ctx, input }) => {
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

  /** Org roster for the assignee picker — everyone who can own a piece/spot. */
  assignableMembers: protectedProcedure.handler(
    async ({ context: ctx }): Promise<Member[]> => {
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
   * Edit an idea's brief and status, and its owned spots' copy, status and
   * schedule. A spot's status and schedule move its whole thread or Story.
   */
  updateWorkItem: actionProcedure(updateContentWorkItem),

  /**
   * Assign / clear the idea-level owner (DRI). `ownerId: null` disowns.
   * Self-assign is just `ownerId === session.user.id`; no admin gate.
   */
  setOwner: protectedProcedure
    .input(
      z.object({ contentPostId: z.string(), ownerId: z.string().nullable() }),
    )
    .handler(async ({ context: ctx, input }) => {
      const content = await ctx.db.query.contentPostTable.findFirst({
        where: eq(contentPostTable.id, input.contentPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!content) throw new ORPCError("NOT_FOUND");
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
    .handler(async ({ context: ctx, input }) => {
      const content = await ctx.db.query.contentPostTable.findFirst({
        where: eq(contentPostTable.id, input.contentPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!content) throw new ORPCError("NOT_FOUND");
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
    .handler(async ({ context: ctx, input }) => {
      const spot = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.platformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!spot) throw new ORPCError("NOT_FOUND");
      await assertOrgMember(ctx, spot.brand?.organizationId);

      await ctx.db
        .update(platformPostTable)
        .set({ ownerId: input.ownerId })
        .where(eq(platformPostTable.id, input.platformPostId));
      return { id: input.platformPostId, ownerId: input.ownerId };
    }),

  /** Approval-gated social publishing. Zernio owns the provider queue while
   * the platform post mirrors its operational state for review and recovery. */
  deliverSocial: protectedProcedure
    .input(
      z.object({
        platformPostId: z.string(),
        mode: z.enum(["schedule", "publish_now"]),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const spot = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.platformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!spot) throw new ORPCError("NOT_FOUND");
      await assertOrgMember(ctx, spot.brand?.organizationId);
      try {
        return await deliverSocialPost(input);
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message: error instanceof Error ? error.message : "Could not publish",
        });
      }
    }),

  refreshSocialDelivery: protectedProcedure
    .input(z.object({ platformPostId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      const spot = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.platformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!spot) throw new ORPCError("NOT_FOUND");
      await assertOrgMember(ctx, spot.brand?.organizationId);
      try {
        return await refreshSocialDelivery(input.platformPostId);
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            error instanceof Error
              ? error.message
              : "Could not refresh delivery",
        });
      }
    }),

  retrySocialDelivery: protectedProcedure
    .input(z.object({ platformPostId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      const spot = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.platformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!spot) throw new ORPCError("NOT_FOUND");
      await assertOrgMember(ctx, spot.brand?.organizationId);
      try {
        return await retrySocialDelivery(input.platformPostId);
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message: error instanceof Error ? error.message : "Could not retry",
        });
      }
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
    .handler(async ({ context: ctx, input }) => {
      const spot = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.platformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!spot) throw new ORPCError("NOT_FOUND");
      await assertOrgMember(ctx, spot.brand?.organizationId);
      if (spot.source !== "owned") {
        throw new ORPCError("FORBIDDEN", {
          message: "Can't edit a scraped post",
        });
      }
      return ContentService.setSpotMedia(input);
    }),

  /** Save one platform publishing unit, including ordered threads or Stories. */
  saveSpotThread: protectedProcedure
    .input(
      z.object({
        rootPlatformPostId: z.string(),
        items: z.array(spotThreadItemInput).min(1).max(25),
        firstComment: z.string().max(2_200).nullable().optional(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const root = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.rootPlatformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!root) throw new ORPCError("NOT_FOUND");
      await assertOrgMember(ctx, root.brand?.organizationId);
      if (root.source !== "owned") {
        throw new ORPCError("FORBIDDEN", {
          message: "Can't edit a scraped post",
        });
      }
      if (root.parentPlatformPostId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Open the root post to edit the complete thread.",
        });
      }

      try {
        return await ContentService.saveSpotThread(input);
      } catch (error) {
        if (error instanceof ORPCError) throw error;
        throw new ORPCError("BAD_REQUEST", {
          message:
            error instanceof Error ? error.message : "Could not save thread",
        });
      }
    }),

  /** Set the content-level media POOL (`content_post.media`). The pool VIEW is
   *  the union of this + every spot's media; this stores the idea-level adds. */
  setPoolMedia: protectedProcedure
    .input(
      z.object({
        contentPostId: z.string(),
        media: z.array(
          z.object({
            url: z.string().max(2000),
            type: z.enum(["image", "video", "carousel"]),
            width: z.number().int().positive().optional(),
            height: z.number().int().positive().optional(),
            thumbnail: z.string().max(2000).optional(),
            assetId: z.string().optional(),
            derivedFrom: z.string().optional(),
          }),
        ),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const content = await ctx.db.query.contentPostTable.findFirst({
        where: eq(contentPostTable.id, input.contentPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!content) throw new ORPCError("NOT_FOUND");
      await assertOrgMember(ctx, content.brand?.organizationId);
      return ContentService.setPoolMedia({
        contentPostId: input.contentPostId,
        media: input.media,
      });
    }),

  /** Capture a new idea: the List's inline "+ Add idea" and the drawer. */
  create: actionProcedure(createIdea),

  /** Lift one platform-first draft/history item into the canonical idea layer. */
  promotePlatformPost: actionProcedure(promotePlatformPost),

  /** Remove an owned spot from an idea (cross-post undo). Scraped spots are
   *  off-limits — those are historical record, not editable plan. */
  removeSpot: protectedProcedure
    .input(z.object({ platformPostId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      const spot = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.platformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!spot) throw new ORPCError("NOT_FOUND");
      await assertOrgMember(ctx, spot.brand?.organizationId);
      if (spot.source !== "owned") {
        throw new ORPCError("FORBIDDEN", {
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
  groupingSuggestions: protectedProcedure.handler(async ({ context: ctx }) => {
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
  resolveGrouping: actionProcedure(resolveContentGrouping),

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
    .handler(async ({ context: ctx, input }) => {
      const { org, brands } = await orgContext(ctx);
      if (!org) throw new ORPCError("FORBIDDEN");
      const ownedIds = new Set(brands.map((b) => b.id));

      const posts = await ctx.db.query.platformPostTable.findMany({
        where: inArray(platformPostTable.id, input.platformPostIds),
        columns: { id: true, brandId: true, text: true, publishedAt: true },
      });
      if (!posts.length) throw new ORPCError("NOT_FOUND");
      // The grouping must touch at least one brand the caller owns.
      if (!posts.some((p) => ownedIds.has(p.brandId))) {
        throw new ORPCError("FORBIDDEN");
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
    .handler(async ({ context: ctx, input }) => {
      const content = await ctx.db.query.contentPostTable.findFirst({
        where: eq(contentPostTable.id, input.contentPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!content) throw new ORPCError("NOT_FOUND");
      await assertOrgMember(ctx, content.brand?.organizationId);
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
    .handler(async ({ context: ctx, input }) => {
      const content = await ctx.db.query.contentPostTable.findFirst({
        where: eq(contentPostTable.id, input.contentPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!content) throw new ORPCError("NOT_FOUND");
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
    .handler(async ({ context: ctx, input }) => {
      const c = await ctx.db.query.contentCommentTable.findFirst({
        where: eq(contentCommentTable.id, input.id),
      });
      if (!c) throw new ORPCError("NOT_FOUND");
      if (c.authorId !== ctx.session.user.id)
        throw new ORPCError("FORBIDDEN", { message: "Not your comment" });
      await ctx.db
        .update(contentCommentTable)
        .set({ deletedAt: new Date() })
        .where(eq(contentCommentTable.id, input.id));
      return { id: input.id };
    }),
};
