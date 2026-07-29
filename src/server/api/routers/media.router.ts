import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  brandTable,
  brandInspirationTable,
  channelTable,
  mediaAssetTable,
  mediaFolderTable,
  mediaKindEnum,
  mediaTagTable,
  memberTable,
  mediaVideoAnalysisTable,
  platformPostTable,
} from "@/server/db/schema";
import { MediaService } from "@/server/services/media.service";
import { analyzeStoredMediaAsset } from "@/server/services/media-asset-analysis.service";
import {
  refreshInstagramPostMedia,
  refreshInstagramProfileMedia,
} from "@/server/services/peer-scrape.service";
import { type db } from "@/server/db";
import {
  completeVideoAnalysis,
  getVideoAnalysis,
  prepareVideoAnalysis,
  saveVideoAnalysisRender,
} from "@/server/services/video-analysis.service";

type Ctx = {
  db: typeof db;
  session: { user: { id: string } };
};

/** Ensure the user belongs to the org that owns the given brand. */
async function assertBrandAccess(ctx: Ctx, brandId: string) {
  const brand = await ctx.db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
  });
  if (!brand)
    throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
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
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No access to this brand",
    });
  }
  return brand;
}

/** Resolve a media asset and assert the caller can manage its brand. */
async function assertMediaAccess(ctx: Ctx, mediaId: string) {
  const asset = await ctx.db.query.mediaAssetTable.findFirst({
    where: eq(mediaAssetTable.id, mediaId),
  });
  if (!asset)
    throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
  await assertBrandAccess(ctx, asset.brandId);
  return asset;
}

/** A timeline post is visible when it belongs to the caller's org or is tracked by it. */
async function assertPostVisible(ctx: Ctx, platformPostId: string) {
  const post = await ctx.db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, platformPostId),
    with: { brand: { columns: { organizationId: true } } },
  });
  if (!post)
    throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
  if (post.brand?.organizationId) {
    await assertBrandAccess(ctx, post.brandId);
    return { ...post, visibleOrganizationId: post.brand.organizationId };
  }

  const memberships = await ctx.db.query.memberTable.findMany({
    where: eq(memberTable.userId, ctx.session.user.id),
  });
  const orgIds = memberships.map((membership) => membership.organizationId);
  const owned = orgIds.length
    ? await ctx.db.query.brandTable.findMany({
        where: inArray(brandTable.organizationId, orgIds),
        columns: { id: true },
      })
    : [];
  const tracked = owned.length
    ? await ctx.db.query.brandInspirationTable.findFirst({
        where: and(
          inArray(
            brandInspirationTable.brandId,
            owned.map((brand) => brand.id),
          ),
          eq(brandInspirationTable.inspirationBrandId, post.brandId),
        ),
        with: { brand: { columns: { organizationId: true } } },
      })
    : null;
  if (!tracked) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No access to this post",
    });
  }
  if (!tracked.brand.organizationId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tracked brand has no owning organization",
    });
  }
  return { ...post, visibleOrganizationId: tracked.brand.organizationId };
}

const videoBoardSchema = z.object({
  index: z.number().int().min(0).max(50),
  url: z.string().url(),
  pathname: z.string().min(1),
  width: z.number().int().positive().max(10_000),
  height: z.number().int().positive().max(20_000),
  firstFrame: z.number().int().positive(),
  lastFrame: z.number().int().positive(),
});

const videoFrameSchema = z.object({
  index: z.number().int().positive().max(1_000),
  timestampMs: z.number().int().min(0),
  boardIndex: z.number().int().min(0).max(50),
  row: z.number().int().min(0).max(10),
  column: z.number().int().min(0).max(10),
});

const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25MB

export const mediaRouter = createTRPCRouter({
  /**
   * Presign a transient chat attachment for direct browser → R2 upload. Not a
   * media_asset — used by the /overview chat composer to attach the image to a
   * message as an AI SDK file part. Any org member can call it.
   */
  createChatUploadUrl: protectedProcedure
    .input(
      z.object({
        fileName: z.string().max(300).optional(),
        mediaType: z.string().min(1).max(120),
        size: z
          .number()
          .int()
          .positive()
          .max(10 * 1024 * 1024),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return MediaService.createChatR2Upload({
        ...input,
        userId: ctx.session.user.id,
      });
    }),

  videoAnalysis: protectedProcedure
    .input(
      z.object({
        platformPostId: z.string(),
        mediaIndex: z.number().int().min(0).max(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const post = await assertPostVisible(ctx, input.platformPostId);
      return getVideoAnalysis({
        organizationId: post.visibleOrganizationId,
        platformPostId: input.platformPostId,
        mediaIndex: input.mediaIndex,
      });
    }),

  prepareVideoAnalysis: protectedProcedure
    .input(
      z.object({
        platformPostId: z.string(),
        mediaIndex: z.number().int().min(0).max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const post = await assertPostVisible(ctx, input.platformPostId);
      return prepareVideoAnalysis({
        organizationId: post.visibleOrganizationId,
        platformPostId: input.platformPostId,
        mediaIndex: input.mediaIndex,
        userId: ctx.session.user.id,
      });
    }),

  saveVideoAnalysisRender: protectedProcedure
    .input(
      z.object({
        analysisId: z.string(),
        durationMs: z.number().int().positive().max(300_000),
        sampleIntervalMs: z.number().int().positive().max(60_000),
        gridSize: z.number().int().min(2).max(5),
        boards: z.array(videoBoardSchema).min(1).max(10),
        frames: z.array(videoFrameSchema).min(1).max(300),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const analysis = await ctx.db.query.mediaVideoAnalysisTable.findFirst({
        where: eq(mediaVideoAnalysisTable.id, input.analysisId),
      });
      if (!analysis)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Video analysis not found",
        });
      const post = await assertPostVisible(ctx, analysis.platformPostId);
      return saveVideoAnalysisRender({
        ...input,
        organizationId: post.visibleOrganizationId,
      });
    }),

  completeVideoAnalysis: protectedProcedure
    .input(z.object({ analysisId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const analysis = await ctx.db.query.mediaVideoAnalysisTable.findFirst({
        where: eq(mediaVideoAnalysisTable.id, input.analysisId),
      });
      if (!analysis)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Video analysis not found",
        });
      const post = await assertPostVisible(ctx, analysis.platformPostId);
      return completeVideoAnalysis({
        ...input,
        organizationId: post.visibleOrganizationId,
      });
    }),

  list: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        kind: z.enum(mediaKindEnum.enumValues).optional(),
        folderId: z.string().nullable().optional(),
        tagId: z.string().optional(),
        query: z.string().trim().max(200).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      return MediaService.list(input);
    }),

  taxonomy: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      const [folders, tags] = await Promise.all([
        ctx.db.query.mediaFolderTable.findMany({
          where: eq(mediaFolderTable.brandId, input.brandId),
          orderBy: [asc(mediaFolderTable.name)],
        }),
        ctx.db.query.mediaTagTable.findMany({
          where: eq(mediaTagTable.brandId, input.brandId),
          orderBy: [asc(mediaTagTable.name)],
        }),
      ]);
      return { folders, tags };
    }),

  createFolder: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        name: z.string().trim().min(1).max(100),
        description: z.string().trim().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      const [folder] = await ctx.db
        .insert(mediaFolderTable)
        .values({
          brandId: input.brandId,
          name: input.name,
          description: input.description || null,
        })
        .returning();
      return folder;
    }),

  updateFolder: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(100),
        description: z.string().trim().max(300).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const folder = await ctx.db.query.mediaFolderTable.findFirst({
        where: eq(mediaFolderTable.id, input.id),
      });
      if (!folder)
        throw new TRPCError({ code: "NOT_FOUND", message: "Folder not found" });
      await assertBrandAccess(ctx, folder.brandId);
      const [updated] = await ctx.db
        .update(mediaFolderTable)
        .set({ name: input.name, description: input.description })
        .where(eq(mediaFolderTable.id, input.id))
        .returning();
      return updated;
    }),

  deleteFolder: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const folder = await ctx.db.query.mediaFolderTable.findFirst({
        where: eq(mediaFolderTable.id, input.id),
      });
      if (!folder)
        throw new TRPCError({ code: "NOT_FOUND", message: "Folder not found" });
      await assertBrandAccess(ctx, folder.brandId);
      await ctx.db
        .delete(mediaFolderTable)
        .where(eq(mediaFolderTable.id, input.id));
      return { id: input.id };
    }),

  createTag: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        name: z.string().trim().min(1).max(60),
        description: z.string().trim().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      const [tag] = await ctx.db
        .insert(mediaTagTable)
        .values({
          brandId: input.brandId,
          name: input.name,
          description: input.description || null,
        })
        .returning();
      return tag;
    }),

  updateTag: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(60),
        description: z.string().trim().max(300).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tag = await ctx.db.query.mediaTagTable.findFirst({
        where: eq(mediaTagTable.id, input.id),
      });
      if (!tag)
        throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found" });
      await assertBrandAccess(ctx, tag.brandId);
      const [updated] = await ctx.db
        .update(mediaTagTable)
        .set({ name: input.name, description: input.description })
        .where(eq(mediaTagTable.id, input.id))
        .returning();
      return updated;
    }),

  deleteTag: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tag = await ctx.db.query.mediaTagTable.findFirst({
        where: eq(mediaTagTable.id, input.id),
      });
      if (!tag)
        throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found" });
      await assertBrandAccess(ctx, tag.brandId);
      await ctx.db.delete(mediaTagTable).where(eq(mediaTagTable.id, input.id));
      return { id: input.id };
    }),

  // --- Direct browser → R2 upload via presigned PUT (image / video / file) ---
  createUploadUrl: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        filename: z.string().min(1).max(300),
        mimeType: z.string().min(1).max(120),
        size: z
          .number()
          .int()
          .positive()
          .max(250 * 1024 * 1024),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      return MediaService.createR2Upload({
        ...input,
        uploadedBy: ctx.session.user.id,
      });
    }),

  finalizeUpload: protectedProcedure
    .input(
      z.object({
        mediaId: z.string(),
        url: z.string().url(),
        pathname: z.string().min(1),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        hasThumbnail: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMediaAccess(ctx, input.mediaId);
      return MediaService.finalizeR2Upload(input);
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

  /** Explicit timeline → library capture. Downloads and rehosts full media. */
  captureFromPost: protectedProcedure
    .input(
      z.object({
        platformPostId: z.string(),
        destinationBrandId: z.string(),
        mediaIndexes: z.array(z.number().int().min(0)).min(1).max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const destination = await assertBrandAccess(
        ctx,
        input.destinationBrandId,
      );
      const source = await ctx.db.query.platformPostTable.findFirst({
        where: eq(platformPostTable.id, input.platformPostId),
        with: { brand: { columns: { organizationId: true } } },
      });
      if (!source) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      if (source.brand?.organizationId !== destination.organizationId) {
        const ownedBrands = await ctx.db.query.brandTable.findMany({
          where: eq(brandTable.organizationId, destination.organizationId!),
          columns: { id: true },
        });
        const tracked = await ctx.db.query.brandInspirationTable.findFirst({
          where: and(
            inArray(
              brandInspirationTable.brandId,
              ownedBrands.map((brand) => brand.id),
            ),
            eq(brandInspirationTable.inspirationBrandId, source.brandId),
          ),
        });
        if (!tracked) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This post is not visible to the destination brand",
          });
        }
      }

      try {
        return await MediaService.capturePostMedia({
          ...input,
          uploadedBy: ctx.session.user.id,
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Could not save media",
        });
      }
    }),

  /** On-demand durable previews for volatile social CDN media; not a library save. */
  stabilizePostMedia: protectedProcedure
    .input(z.object({ platformPostId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertPostVisible(ctx, input.platformPostId);
      try {
        return await MediaService.stabilizePostMedia(input.platformPostId);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Could not preserve previews",
        });
      }
    }),

  /** Re-fetch one public Instagram post to renew its media URLs and previews. */
  refreshInstagramPost: protectedProcedure
    .input(z.object({ platformPostId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const post = await assertPostVisible(ctx, input.platformPostId);
      if (post.platform !== "instagram" || !post.externalUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This post has no refreshable Instagram permalink",
        });
      }
      try {
        const refreshed = await refreshInstagramPostMedia({
          brandId: post.brandId,
          postUrl: post.externalUrl,
        });
        const cached = await MediaService.cachePostVideoMedia(post.id);
        return {
          ...refreshed,
          videoCached: cached.cached,
          videoCacheFailed: cached.failed,
        };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Could not refresh Instagram media",
        });
      }
    }),

  /** Explicitly cache full owned-post media for durable Timeline playback. */
  cacheBrandPostMedia: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      try {
        return await MediaService.cacheBrandPostMedia(input.brandId);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Could not cache media",
        });
      }
    }),

  /** Re-fetch an owned Instagram profile, then cache its fresh full media. */
  refreshOwnedInstagramMedia: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      const channel = await ctx.db.query.channelTable.findFirst({
        where: and(
          eq(channelTable.brandId, input.brandId),
          eq(channelTable.platform, "instagram"),
        ),
      });
      if (!channel?.profileUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Add the owned Instagram profile URL before refreshing media",
        });
      }
      try {
        const refreshed = await refreshInstagramProfileMedia({
          brandId: input.brandId,
          profileUrl: channel.profileUrl,
        });
        const cached = await MediaService.cacheBrandPostMedia(input.brandId);
        return {
          ...refreshed,
          cached: cached.cached,
          cacheFailed: cached.failed,
        };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Could not refresh owned Instagram media",
        });
      }
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
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Thumbnail too large",
          });
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
        folderId: z.string().nullable().optional(),
        humanTagIds: z.array(z.string()).max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const asset = await assertMediaAccess(ctx, input.id);
      if (input.folderId) {
        const folder = await ctx.db.query.mediaFolderTable.findFirst({
          where: and(
            eq(mediaFolderTable.id, input.folderId),
            eq(mediaFolderTable.brandId, asset.brandId),
          ),
        });
        if (!folder)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Folder does not belong to this brand",
          });
      }
      if (input.humanTagIds?.length) {
        const tags = await ctx.db.query.mediaTagTable.findMany({
          where: and(
            eq(mediaTagTable.brandId, asset.brandId),
            inArray(mediaTagTable.id, input.humanTagIds),
          ),
        });
        if (tags.length !== new Set(input.humanTagIds).size)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "One or more tags do not belong to this brand",
          });
      }
      return MediaService.updateMeta(input);
    }),

  analyze: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        steer: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const asset = await assertMediaAccess(ctx, input.id);
      if (asset.kind !== "image" || !asset.url) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only ready images can be analyzed",
        });
      }
      const brand = await assertBrandAccess(ctx, asset.brandId);
      return analyzeStoredMediaAsset({
        mediaId: asset.id,
        brandName: brand.name,
        steer: input.steer,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertMediaAccess(ctx, input.id);
      return MediaService.delete(input.id);
    }),
});
