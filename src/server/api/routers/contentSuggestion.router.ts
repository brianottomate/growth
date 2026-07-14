import { z } from "zod";
import { and, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { type db } from "@/server/db";
import {
  brandInspirationTable,
  brandTable,
  contentSuggestionTable,
  memberTable,
  platformPostLinkTable,
  platformPostTable,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";

type Ctx = {
  db: typeof db;
  session: { user: { id: string } };
};

async function accessibleBrandIds(ctx: Ctx) {
  const membership = await ctx.db.query.memberTable.findFirst({
    where: eq(memberTable.userId, ctx.session.user.id),
  });
  if (!membership) return [];
  const owned = await ctx.db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, membership.organizationId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true },
  });
  const ownedIds = owned.map((brand) => brand.id);
  if (!ownedIds.length) return [];
  const tracked = await ctx.db.query.brandInspirationTable.findMany({
    where: inArray(brandInspirationTable.brandId, ownedIds),
    columns: { inspirationBrandId: true },
  });
  return [
    ...new Set([...ownedIds, ...tracked.map((row) => row.inspirationBrandId)]),
  ];
}

function proposal(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const contentSuggestionRouter = createTRPCRouter({
  pending: protectedProcedure.query(async ({ ctx }) => {
    const brandIds = await accessibleBrandIds(ctx);
    if (!brandIds.length) return [];
    const suggestions = await ctx.db.query.contentSuggestionTable.findMany({
      where: and(
        inArray(contentSuggestionTable.brandId, brandIds),
        eq(contentSuggestionTable.status, "pending"),
        notInArray(contentSuggestionTable.kind, ["grouping"]),
      ),
      orderBy: [desc(contentSuggestionTable.confidence)],
      with: { brand: true, subjectPost: true, targetPost: true },
    });
    return suggestions.map((suggestion) => ({
      ...suggestion,
      subjectPost: suggestion.subjectPost
        ? {
            id: suggestion.subjectPost.id,
            platform: suggestion.subjectPost.platform,
            text: suggestion.subjectPost.text,
            externalUrl: suggestion.subjectPost.externalUrl,
          }
        : null,
      targetPost: suggestion.targetPost
        ? {
            id: suggestion.targetPost.id,
            platform: suggestion.targetPost.platform,
            text: suggestion.targetPost.text,
            externalUrl: suggestion.targetPost.externalUrl,
          }
        : null,
    }));
  }),

  resolve: protectedProcedure
    .input(z.object({ id: z.string(), accept: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const allowed = new Set(await accessibleBrandIds(ctx));
      const suggestion = await ctx.db.query.contentSuggestionTable.findFirst({
        where: and(
          eq(contentSuggestionTable.id, input.id),
          eq(contentSuggestionTable.status, "pending"),
        ),
      });
      if (!suggestion) throw new TRPCError({ code: "NOT_FOUND" });
      if (!allowed.has(suggestion.brandId)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      let appliedLinkId: string | null = null;
      if (input.accept && suggestion.kind === "classification") {
        const proposed = proposal(suggestion.proposed);
        const patch = Object.fromEntries(
          ["format", "archetype", "template"].flatMap((key) =>
            typeof proposed[key] === "string" ? [[key, proposed[key]]] : [],
          ),
        );
        if (!Object.keys(patch).length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Classification proposal has no applicable fields",
          });
        }
        await ctx.db
          .update(platformPostTable)
          .set(patch)
          .where(eq(platformPostTable.id, suggestion.subjectPostId));
      } else if (input.accept) {
        if (!suggestion.targetPostId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "The target post must be resolved before accepting this edge",
          });
        }
        const proposed = proposal(suggestion.proposed);
        const fallbackKind =
          suggestion.kind === "amplification" ? "amplifies" : suggestion.kind;
        const [link] = await ctx.db
          .insert(platformPostLinkTable)
          .values({
            id: createId("ppl"),
            fromPlatformPostId: suggestion.subjectPostId,
            toPlatformPostId: suggestion.targetPostId,
            kind:
              typeof proposed.linkKind === "string"
                ? proposed.linkKind
                : fallbackKind,
            metadata: { suggestionId: suggestion.id },
          })
          .returning({ id: platformPostLinkTable.id });
        appliedLinkId = link?.id ?? null;
      }

      const [resolved] = await ctx.db
        .update(contentSuggestionTable)
        .set({
          status: input.accept ? "accepted" : "rejected",
          appliedLinkId,
          reviewedById: ctx.session.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(contentSuggestionTable.id, suggestion.id))
        .returning();
      return resolved;
    }),
});
