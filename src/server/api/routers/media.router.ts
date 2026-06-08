import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { brandTable, mediaAssetTable, mediaKindEnum, memberTable } from "@/server/db/schema";
import { MediaService } from "@/server/services/media.service";

type Ctx = {
  db: typeof import("@/server/db").db;
  session: { user: { id: string } };
};

/** Ensure the user belongs to the org that owns the given brand. */
async function assertBrandAccess(ctx: Ctx, brandId: string) {
  const brand = await ctx.db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
  });
  if (!brand) throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
  if (!brand.organizationId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot attach media to a tracked/reference brand",
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

/** Resolve a media asset and assert the caller can manage its brand. */
async function assertMediaAccess(ctx: Ctx, mediaId: string) {
  const asset = await ctx.db.query.mediaAssetTable.findFirst({
    where: eq(mediaAssetTable.id, mediaId),
  });
  if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
  await assertBrandAccess(ctx, asset.brandId);
  return asset;
}

const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25MB

export const mediaRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        kind: z.enum(mediaKindEnum.enumValues).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      return MediaService.list(input);
    }),

  // --- R2 (image / gif / file) ---
  createUploadUrl: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        filename: z.string().min(1).max(300),
        mimeType: z.string().min(1).max(120),
        size: z.number().int().positive().max(MAX_IMAGE_BYTES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      if (MediaService.isVideoMime(input.mimeType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Use createVideoUpload for video files",
        });
      }
      return MediaService.createR2Upload({
        ...input,
        uploadedBy: ctx.session.user.id,
      });
    }),

  finalizeUpload: protectedProcedure
    .input(
      z.object({
        mediaId: z.string(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMediaAccess(ctx, input.mediaId);
      return MediaService.finalizeR2Upload(input);
    }),

  // --- Cloudflare Stream (video) ---
  createVideoUpload: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        filename: z.string().min(1).max(300),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      return MediaService.createVideoUpload({
        ...input,
        uploadedBy: ctx.session.user.id,
      });
    }),

  /** Poll Stream for a still-processing video (used by the grid). */
  syncVideo: protectedProcedure
    .input(z.object({ mediaId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertMediaAccess(ctx, input.mediaId);
      return MediaService.syncVideo(input.mediaId);
    }),

  // --- External (linked) asset — Drive / Dropbox / Frame.io, not hosted ---
  createExternal: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        externalUrl: z.string().url().max(2000),
        kind: z.enum(mediaKindEnum.enumValues).optional(),
        title: z.string().max(300).optional(),
        sourceProvider: z.string().max(60).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      return MediaService.createExternal({
        ...input,
        uploadedBy: ctx.session.user.id,
      });
    }),

  /** Edit a linked asset's title / URL / kind / thumbnail. */
  updateExternal: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().max(300).optional(),
        externalUrl: z.string().url().max(2000).optional(),
        kind: z.enum(mediaKindEnum.enumValues).optional(),
        thumbnail: z
          .object({
            base64Data: z.string(),
            mimeType: z.string().min(1).max(120),
            filename: z.string().min(1).max(300),
          })
          .optional(),
        thumbnailUrl: z.string().url().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const asset = await assertMediaAccess(ctx, input.id);
      if (asset.provider !== "external") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only linked assets can be edited here",
        });
      }
      if (input.thumbnail) {
        const bytes = Buffer.byteLength(input.thumbnail.base64Data, "base64");
        if (bytes > MAX_IMAGE_BYTES) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Thumbnail too large" });
        }
      }
      return MediaService.updateExternal({ ...input, brandId: asset.brandId });
    }),

  // --- shared ---
  updateMeta: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().max(300).optional(),
        alt: z.string().max(500).optional(),
        tags: z.array(z.string().max(50)).max(30).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMediaAccess(ctx, input.id);
      return MediaService.updateMeta(input);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertMediaAccess(ctx, input.id);
      return MediaService.delete(input.id);
    }),
});
