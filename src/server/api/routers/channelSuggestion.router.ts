import { z } from "zod";
import { and, desc, eq, ilike } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  brandInspirationTable,
  brandTable,
  channelSuggestionTable,
  channelTable,
  memberTable,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { type db } from "@/server/db";
import { discoverAndSaveSuggestions } from "@/server/services/social-discovery.service";
import {
  ScrapeSetupError,
  scrapeBrandChannel,
} from "@/server/services/peer-scrape.service";

type Ctx = { db: typeof db; session: { user: { id: string } } };

async function userOrgIds(ctx: Ctx): Promise<string[]> {
  const memberships = await ctx.db.query.memberTable.findMany({
    where: eq(memberTable.userId, ctx.session.user.id),
  });
  return memberships.map((m) => m.organizationId);
}

/**
 * Assert the user can manage `brandId` (owned: org member; reference: tracked by
 * one of the user's owned brands). Mirrors brand.router so suggestions work for
 * peer brands too. Returns the brand.
 */
async function assertBrandManageable(ctx: Ctx, brandId: string) {
  const brand = await ctx.db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
  });
  if (!brand)
    throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });

  const orgIds = await userOrgIds(ctx);
  if (brand.organizationId) {
    if (!orgIds.includes(brand.organizationId)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "No access to this brand",
      });
    }
    return brand;
  }
  const link = await ctx.db.query.brandInspirationTable.findFirst({
    where: eq(brandInspirationTable.inspirationBrandId, brandId),
    with: { brand: true },
  });
  const ownerOrg = link?.brand?.organizationId;
  if (!ownerOrg || !orgIds.includes(ownerOrg)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No access to this brand",
    });
  }
  return brand;
}

export const channelSuggestionRouter = createTRPCRouter({
  /** Pending suggestions for a brand, highest-confidence first. */
  list: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      return ctx.db.query.channelSuggestionTable.findMany({
        where: and(
          eq(channelSuggestionTable.brandId, input.brandId),
          eq(channelSuggestionTable.status, "pending"),
        ),
        orderBy: [desc(channelSuggestionTable.confidence)],
      });
    }),

  /**
   * Discover + persist handle suggestions for a brand. Unverified on purpose:
   * the reviewer confirms by opening the link, and the first scrape after
   * acceptance proves the profile and fills follower counts.
   */
  discover: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      return discoverAndSaveSuggestions(input.brandId);
    }),

  /**
   * On-demand pull of a brand's recent posts for one platform into
   * platform_post + pending content_suggestion rows. `limit` is the sample
   * size (5 = "does this channel work?", 30+ = backfill); `sinceDays` bounds
   * the window (max 3 months). Idempotent: dedups by externalId, so re-runs
   * only ingest new posts. Works for peer brands (the access check mirrors
   * discover/accept).
   */
  scrapePosts: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        platform: z.enum(["instagram", "facebook", "linkedin", "x"]),
        sinceDays: z.number().int().min(1).max(93).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      try {
        return await scrapeBrandChannel({
          brandId: input.brandId,
          platform: input.platform,
          sinceDays: input.sinceDays,
          limit: input.limit,
          requestedById: ctx.session.user.id,
        });
      } catch (error) {
        if (error instanceof ScrapeSetupError) {
          throw new TRPCError({
            code:
              error.code === "missing_profile_url"
                ? "BAD_REQUEST"
                : "PRECONDITION_FAILED",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /** Accept a suggestion → create the channel + mark accepted. */
  accept: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const suggestion = await ctx.db.query.channelSuggestionTable.findFirst({
        where: eq(channelSuggestionTable.id, input.id),
      });
      if (!suggestion) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Suggestion not found",
        });
      }
      await assertBrandManageable(ctx, suggestion.brandId);

      const now = new Date();
      let channel = await ctx.db.query.channelTable.findFirst({
        where: and(
          eq(channelTable.brandId, suggestion.brandId),
          eq(channelTable.platform, suggestion.platform),
          ilike(channelTable.handle, suggestion.handle.replace(/^@/, "")),
        ),
      });
      if (!channel) {
        [channel] = await ctx.db
          .insert(channelTable)
          .values({
            id: createId("chan"),
            brandId: suggestion.brandId,
            kind: "social",
            platform: suggestion.platform,
            handle: suggestion.handle,
            profileUrl: suggestion.profileUrl,
            profileImageUrl: suggestion.profileImageUrl,
            // Reference/peer handles aren't OAuth-connected — they're tracked.
            connectionStatus: "disconnected",
            followerCount: suggestion.followerCount ?? null,
            followerHistory: suggestion.followerCount
              ? [
                  {
                    count: suggestion.followerCount,
                    capturedAt: now.toISOString(),
                  },
                ]
              : [],
          })
          .returning();
      }

      await ctx.db
        .update(channelSuggestionTable)
        .set({
          status: "accepted",
          acceptedChannelId: channel?.id,
          reviewedById: ctx.session.user.id,
          reviewedAt: now,
        })
        .where(eq(channelSuggestionTable.id, input.id));

      return channel;
    }),

  /** Reject a suggestion (remembered — won't be re-proposed). */
  reject: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const suggestion = await ctx.db.query.channelSuggestionTable.findFirst({
        where: eq(channelSuggestionTable.id, input.id),
      });
      if (!suggestion) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Suggestion not found",
        });
      }
      await assertBrandManageable(ctx, suggestion.brandId);
      await ctx.db
        .update(channelSuggestionTable)
        .set({
          status: "rejected",
          reviewedById: ctx.session.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(channelSuggestionTable.id, input.id));
      return { ok: true };
    }),
});
