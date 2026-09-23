import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

import { actionProcedure, protectedProcedure } from "@/server/api/orpc";
import { registerBrandChannel } from "@/server/ai/capabilities/operations";
import {
  brandTable,
  channelKindEnum,
  channelPlatformEnum,
  channelTable,
  connectionStatusEnum,
  memberTable,
} from "@/server/db/schema";
import { type db } from "@/server/db";
import { R2 } from "@/server/clients/r2.client";

type Ctx = {
  db: typeof db;
  session: { user: { id: string } };
};

/** Ensure the user can manage the given owned brand. Returns the brand. */
async function assertBrandAccess(ctx: Ctx, brandId: string) {
  const brand = await ctx.db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
  });
  if (!brand) {
    throw new ORPCError("NOT_FOUND", { message: "Brand not found" });
  }
  if (!brand.organizationId) {
    throw new ORPCError("BAD_REQUEST", {
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
    throw new ORPCError("FORBIDDEN", { message: "No access to this brand" });
  }
  return brand;
}

const followerSnapshotSchema = z.object({
  count: z.number().int().min(0),
  capturedAt: z.string(),
  note: z.string().max(500).optional(),
});

const channelPhotoSchema = z.object({
  base64Data: z.string(),
  mimeType: z.string(),
  filename: z.string(),
});

async function uploadChannelImage(
  channelId: string,
  input: {
    photo?: z.infer<typeof channelPhotoSchema>;
    photoUrl?: string;
  },
  kind: "avatar" | "banner",
) {
  if (input.photo) {
    const buffer = Buffer.from(input.photo.base64Data, "base64");
    if (buffer.length > 4.5 * 1024 * 1024) {
      throw new ORPCError("BAD_REQUEST", {
        message: `${kind === "banner" ? "Banner" : "Photo"} exceeds 4.5MB`,
      });
    }
    return R2.putBuffer(
      R2.buildUploadKey(
        kind === "banner" ? "channel-banners" : "channel-avatars",
        channelId,
        input.photo.filename,
      ),
      buffer,
      input.photo.mimeType,
    );
  }
  if (input.photoUrl) {
    return R2.putFromUrl(
      R2.buildUploadKey(
        kind === "banner" ? "channel-banners" : "channel-avatars",
        channelId,
        kind,
      ),
      input.photoUrl,
    );
  }
  return null;
}

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
  profileImageUrl: z.string().trim().max(2000).optional(),
  bannerImageUrl: z.string().trim().max(2000).optional(),
  profileUrl: z.string().trim().max(2000).optional(),
  manageUrl: z.string().trim().max(2000).optional(),
  connectionStatus: z.enum(connectionStatusEnum.enumValues).optional(),
  // Client owns the full history list; `followerCount` is derived from its latest entry.
  followerHistory: z.array(followerSnapshotSchema).max(1000).optional(),
};

export const channelRouter = {
  create: actionProcedure(registerBrandChannel),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        kind: channelFields.kind.optional(),
        platform: channelFields.platform.optional(),
        handle: channelFields.handle,
        profileImageUrl: channelFields.profileImageUrl,
        bannerImageUrl: channelFields.bannerImageUrl,
        profileUrl: channelFields.profileUrl,
        manageUrl: channelFields.manageUrl,
        connectionStatus: channelFields.connectionStatus,
        followerHistory: channelFields.followerHistory,
        photo: channelPhotoSchema.optional(),
        photoUrl: z.string().url().optional(),
        bannerPhoto: channelPhotoSchema.optional(),
        bannerPhotoUrl: z.string().url().optional(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const channel = await ctx.db.query.channelTable.findFirst({
        where: eq(channelTable.id, input.id),
      });
      if (!channel) {
        throw new ORPCError("NOT_FOUND", { message: "Channel not found" });
      }
      await assertBrandAccess(ctx, channel.brandId);

      const { id, photo, photoUrl, bannerPhoto, bannerPhotoUrl, ...rest } =
        input;
      const [uploadedProfileImageUrl, uploadedBannerImageUrl] =
        await Promise.all([
          uploadChannelImage(id, { photo, photoUrl }, "avatar"),
          uploadChannelImage(
            id,
            { photo: bannerPhoto, photoUrl: bannerPhotoUrl },
            "banner",
          ),
        ]);

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
          ...(rest.profileImageUrl !== undefined && {
            profileImageUrl: rest.profileImageUrl || null,
          }),
          ...(uploadedProfileImageUrl && {
            profileImageUrl: uploadedProfileImageUrl,
          }),
          ...(rest.bannerImageUrl !== undefined && {
            bannerImageUrl: rest.bannerImageUrl || null,
          }),
          ...(uploadedBannerImageUrl && {
            bannerImageUrl: uploadedBannerImageUrl,
          }),
          ...(rest.profileUrl !== undefined && {
            profileUrl: rest.profileUrl || null,
          }),
          ...(rest.manageUrl !== undefined && {
            manageUrl: rest.manageUrl || null,
          }),
          ...(rest.connectionStatus !== undefined && {
            connectionStatus: rest.connectionStatus,
          }),
          ...followerUpdate,
          ...(uploadedProfileImageUrl ||
          uploadedBannerImageUrl ||
          rest.profileImageUrl !== undefined ||
          rest.bannerImageUrl !== undefined
            ? {
                metadata: {
                  ...((channel.metadata as Record<string, unknown> | null) ??
                    {}),
                  ...(uploadedProfileImageUrl ||
                  rest.profileImageUrl !== undefined
                    ? { profileImageManual: true }
                    : {}),
                  ...(uploadedBannerImageUrl ||
                  rest.bannerImageUrl !== undefined
                    ? { bannerImageManual: true }
                    : {}),
                },
              }
            : {}),
        })
        .where(eq(channelTable.id, id))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      const channel = await ctx.db.query.channelTable.findFirst({
        where: eq(channelTable.id, input.id),
      });
      if (!channel) {
        throw new ORPCError("NOT_FOUND", { message: "Channel not found" });
      }
      await assertBrandAccess(ctx, channel.brandId);
      await ctx.db.delete(channelTable).where(eq(channelTable.id, input.id));
      return { id: input.id };
    }),
};
