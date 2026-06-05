import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  brandTable,
  channelKindEnum,
  channelPlatformEnum,
  channelTable,
  connectionStatusEnum,
  memberTable,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";

type Ctx = { db: typeof import("@/server/db").db; session: { user: { id: string } } };

/** Ensure the user can manage the given owned brand. Returns the brand. */
async function assertBrandAccess(ctx: Ctx, brandId: string) {
  const brand = await ctx.db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
  });
  if (!brand) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
  }
  if (!brand.organizationId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot add channels to a tracked/reference brand",
    });
  }
  const membership = await ctx.db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.userId, ctx.session.user.id),
      eq(memberTable.organizationId, brand.organizationId),
    ),
  });
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No access to this brand" });
  }
  return brand;
}

const followerSnapshotSchema = z.object({
  count: z.number().int().min(0),
  capturedAt: z.string(),
  note: z.string().max(500).optional(),
});

/** Latest snapshot's count (by capture date), or null if no history. */
function latestFollowerCount(
  history: z.infer<typeof followerSnapshotSchema>[],
): number | null {
  if (history.length === 0) return null;
  return history.reduce((a, b) => (a.capturedAt >= b.capturedAt ? a : b)).count;
}

const channelFields = {
  kind: z.enum(channelKindEnum.enumValues),
  platform: z.enum(channelPlatformEnum.enumValues),
  handle: z.string().trim().max(200).optional(),
  profileUrl: z.string().trim().max(2000).optional(),
  manageUrl: z.string().trim().max(2000).optional(),
  connectionStatus: z.enum(connectionStatusEnum.enumValues).optional(),
  // Client owns the full history list; `followerCount` is derived from its latest entry.
  followerHistory: z.array(followerSnapshotSchema).max(1000).optional(),
};

export const channelRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({ brandId: z.string(), ...channelFields }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      const [created] = await ctx.db
        .insert(channelTable)
        .values({
          id: createId("chan"),
          brandId: input.brandId,
          kind: input.kind,
          platform: input.platform,
          handle: input.handle || null,
          profileUrl: input.profileUrl || null,
          manageUrl: input.manageUrl || null,
          connectionStatus: input.connectionStatus ?? "connected",
          followerHistory: input.followerHistory ?? [],
          followerCount: latestFollowerCount(input.followerHistory ?? []),
        })
        .returning();
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        kind: channelFields.kind.optional(),
        platform: channelFields.platform.optional(),
        handle: channelFields.handle,
        profileUrl: channelFields.profileUrl,
        manageUrl: channelFields.manageUrl,
        connectionStatus: channelFields.connectionStatus,
        followerHistory: channelFields.followerHistory,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const channel = await ctx.db.query.channelTable.findFirst({
        where: eq(channelTable.id, input.id),
      });
      if (!channel) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
      }
      await assertBrandAccess(ctx, channel.brandId);

      const { id, ...rest } = input;

      // Client owns the history list; when it's sent, replace it and re-derive
      // the cached `followerCount` from the latest snapshot.
      const followerUpdate =
        rest.followerHistory !== undefined
          ? {
              followerHistory: rest.followerHistory,
              followerCount: latestFollowerCount(rest.followerHistory),
            }
          : {};

      const [updated] = await ctx.db
        .update(channelTable)
        .set({
          ...(rest.kind !== undefined && { kind: rest.kind }),
          ...(rest.platform !== undefined && { platform: rest.platform }),
          ...(rest.handle !== undefined && { handle: rest.handle || null }),
          ...(rest.profileUrl !== undefined && { profileUrl: rest.profileUrl || null }),
          ...(rest.manageUrl !== undefined && { manageUrl: rest.manageUrl || null }),
          ...(rest.connectionStatus !== undefined && {
            connectionStatus: rest.connectionStatus,
          }),
          ...followerUpdate,
        })
        .where(eq(channelTable.id, id))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const channel = await ctx.db.query.channelTable.findFirst({
        where: eq(channelTable.id, input.id),
      });
      if (!channel) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
      }
      await assertBrandAccess(ctx, channel.brandId);
      await ctx.db.delete(channelTable).where(eq(channelTable.id, input.id));
      return { id: input.id };
    }),
});
