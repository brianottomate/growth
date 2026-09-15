import { scrapeSiteImages } from "@/server/clients/firecrawl.client";
import { z } from "zod";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  brandTable,
  brandInspirationTable,
  channelTable,
  mediaAssetTable,
  mediaAssetTagTable,
  mediaFolderTable,
  mediaKindEnum,
  mediaTagTable,
  memberTable,
  mediaVideoAnalysisTable,
  platformPostTable,
} from "@/server/db/schema";
import { MAX_STORYBOARD_BOARDS } from "@/lib/storyboard-limits";
import {
  MediaService,
  findImportedImage,
  importRemoteImage,
  storyboardDescriptorSchema,
} from "@/server/services/media.service";
import { brandListings } from "@/server/services/wanderos-listings.service";
import { analyzeStoredMediaAsset } from "@/server/services/media-asset-analysis.service";
import {
  refreshInstagramPostMedia,
  refreshInstagramProfileMedia,
} from "@/server/services/peer-scrape.service";
import { type db, withTransaction } from "@/server/db";
import {
  completeVideoAnalysis,
  getVideoAnalysis,
  prepareVideoAnalysis,
  saveVideoAnalysisRender,
} from "@/server/services/video-analysis.service";
import {
  formatChatAttachmentLimit,
  maxChatAttachmentBytes,
} from "@/lib/chat-attachment";

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
      z
        .object({
          fileName: z.string().max(300).optional(),
          mediaType: z.string().min(1).max(120),
          size: z.number().int().positive(),
        })
        .superRefine((input, ctx) => {
          const maximum = maxChatAttachmentBytes(input.mediaType);
          if (!maximum) {
            ctx.addIssue({
              code: "custom",
              path: ["mediaType"],
              message: "Unsupported chat attachment type",
            });
          } else if (input.size > maximum) {
            ctx.addIssue({
              code: "too_big",
              origin: "number",
              maximum,
              inclusive: true,
              path: ["size"],
              message: input.mediaType.startsWith("video/")
                ? `Video exceeds the ${formatChatAttachmentLimit(maximum)} chat limit`
                : `Image exceeds the ${formatChatAttachmentLimit(maximum)} chat limit`,
            });
          }
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
      // Settle abandoned uploads first: a successful PUT whose finalize never
      // ran should appear, and a genuine failure should say so rather than
      // silently disappearing from the grid.
      await MediaService.reconcileStaleUploads(input.brandId).catch(
        () => undefined,
      );
      return MediaService.list(input);
    }),

  /**
   * A look at the brand's listing photos without importing any: hero and
   * thumbnail URLs straight from their WanderOS feed, marked where the library
   * already holds one. The picker shows these; only what the operator ticks
   * is imported, so sampling a site does not fill the library with it.
   */
  listingSamples: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        limit: z.number().int().min(1).max(48).default(24),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      const brand = await ctx.db.query.brandTable.findFirst({
        where: eq(brandTable.id, input.brandId),
        columns: { id: true, website: true },
      });
      const listings = (
        await brandListings({
          id: input.brandId,
          website: brand?.website ?? null,
        })
      )
        .filter((row) => row.imageUrl)
        .slice(0, input.limit);
      const urls = listings.map((row) => row.imageUrl!);
      const imported =
        urls.length > 0
          ? await ctx.db.query.mediaAssetTable.findMany({
              where: and(
                eq(mediaAssetTable.brandId, input.brandId),
                eq(mediaAssetTable.status, "ready"),
                isNull(mediaAssetTable.deletedAt),
                sql`${mediaAssetTable.metadata} ->> 'sourceUrl' in (${sql.join(
                  urls.map((url) => sql`${url}`),
                  sql`, `,
                )})`,
              ),
              columns: { id: true, metadata: true },
            })
          : [];
      const importedByUrl = new Map(
        imported.map((row) => [
          (row.metadata as { sourceUrl?: string } | null)?.sourceUrl ?? "",
          row.id,
        ]),
      );
      return {
        hasSite: Boolean(brand?.website),
        homes: listings.map((row) => ({
          id: row.id,
          name: row.name,
          url: row.url,
          imageUrl: row.imageUrl!,
          thumbUrl: row.thumbUrl ?? row.imageUrl!,
          place: [row.city, row.state].filter(Boolean).join(", "),
          importedAssetId: importedByUrl.get(row.imageUrl!) ?? null,
        })),
      };
    }),

  /**
   * The images on the brand's own website, read on demand, marked where the
   * library already holds one. Nothing is imported until the operator ticks.
   */
  siteImages: protectedProcedure
    .input(z.object({ brandId: z.string(), url: z.string().url().optional() }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      const brand = await ctx.db.query.brandTable.findFirst({
        where: eq(brandTable.id, input.brandId),
        columns: { id: true, website: true },
      });
      const site = input.url ?? brand?.website ?? null;
      if (!site)
        return {
          site: null,
          images: [] as { url: string; importedAssetId: string | null }[],
        };
      const urls = (await scrapeSiteImages(site)).slice(0, 60);
      const imported = urls.length
        ? await ctx.db.query.mediaAssetTable.findMany({
            where: and(
              eq(mediaAssetTable.brandId, input.brandId),
              eq(mediaAssetTable.status, "ready"),
              isNull(mediaAssetTable.deletedAt),
              sql`${mediaAssetTable.metadata} ->> 'sourceUrl' in (${sql.join(
                urls.map((url) => sql`${url}`),
                sql`, `,
              )})`,
            ),
            columns: { id: true, metadata: true },
          })
        : [];
      const byUrl = new Map(
        imported.map((row) => [
          (row.metadata as { sourceUrl?: string } | null)?.sourceUrl ?? "",
          row.id,
        ]),
      );
      return {
        site,
        images: urls.map((url) => ({
          url,
          importedAssetId: byUrl.get(url) ?? null,
        })),
      };
    }),

  /** Import the site images the operator ticked. Idempotent per URL. */
  importUrls: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        images: z
          .array(
            z.object({
              url: z.string().url(),
              title: z.string().max(180).optional(),
            }),
          )
          .min(1)
          .max(60),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      const assets: { id: string; url: string | null }[] = [];
      for (const image of input.images) {
        const asset =
          (await findImportedImage({
            brandId: input.brandId,
            url: image.url,
          })) ??
          (await importRemoteImage({
            brandId: input.brandId,
            uploadedBy: ctx.session.user.id,
            url: image.url,
            title: image.title ?? "From their site",
          }));
        assets.push({ id: asset.id, url: asset.url });
      }
      return { assets };
    }),

  /**
   * Import the listing photos the operator ticked. Idempotent per URL: a hero
   * already in the library is returned rather than imported twice.
   */
  importListingImages: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        homes: z
          .array(
            z.object({ imageUrl: z.string().url(), name: z.string().min(1) }),
          )
          .min(1)
          .max(48),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      const assets: { id: string; url: string | null; name: string }[] = [];
      // Sequential: each import is a download and an R2 write.
      for (const home of input.homes) {
        const asset =
          (await findImportedImage({
            brandId: input.brandId,
            url: home.imageUrl,
          })) ??
          (await importRemoteImage({
            brandId: input.brandId,
            uploadedBy: ctx.session.user.id,
            url: home.imageUrl,
            title: home.name,
          }));
        assets.push({ id: asset.id, url: asset.url, name: home.name });
      }
      return { assets };
    }),

  /**
   * Library metadata for a set of assets, for callers holding ids rather than
   * a brand's whole library — an ad's creative pool above all, which stores
   * `MediaItem` JSON (url, type, thumbnail) and nothing a person can read.
   *
   * Brand-scoped, so an id from another organization is simply absent from
   * the result rather than an error: a pool can legitimately reference an
   * asset that has since been deleted.
   */
  byIds: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        ids: z.array(z.string().min(1)).max(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      if (input.ids.length === 0) return [];
      const rows = await ctx.db.query.mediaAssetTable.findMany({
        where: and(
          eq(mediaAssetTable.brandId, input.brandId),
          inArray(mediaAssetTable.id, input.ids),
          isNull(mediaAssetTable.deletedAt),
        ),
        columns: {
          id: true,
          kind: true,
          title: true,
          alt: true,
          filename: true,
          width: true,
          height: true,
          duration: true,
          size: true,
          mimeType: true,
          status: true,
          metadata: true,
          storyboard: false,
        },
        with: { tagAssignments: { with: { tag: true } } },
      });
      return rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        alt: row.alt,
        filename: row.filename,
        width: row.width,
        height: row.height,
        duration: row.duration,
        size: row.size,
        mimeType: row.mimeType,
        status: row.status,
        // Whether a teardown exists at all is what an operator wants on a
        // tile; the analysis body itself is far too big for a grid.
        analyzed: Boolean(
          row.metadata &&
          typeof row.metadata === "object" &&
          "aiAnalysis" in row.metadata,
        ),
        tags: row.tagAssignments.map((assignment) => assignment.tag.name),
      }));
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

  /**
   * Re-point an asset at another brand in the same organization.
   *
   * Uploading to the wrong brand is a two-click mistake with no warning, and
   * the picker is brand-scoped, so the asset simply does not appear where the
   * operator expects it. Until this existed the only remedy was a hand-written
   * UPDATE against production.
   *
   * Folder and tags are brand-scoped, so both are dropped rather than left
   * pointing across a brand boundary. `r2Key` deliberately keeps the original
   * prefix: it is an opaque object location, not a claim of ownership, and
   * rewriting it would mean copying the bytes for no functional gain.
   */
  moveToBrand: protectedProcedure
    .input(z.object({ mediaId: z.string(), brandId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const asset = await assertMediaAccess(ctx, input.mediaId);
      if (asset.brandId === input.brandId) return asset;
      await assertBrandAccess(ctx, input.brandId);

      return withTransaction(async (tx) => {
        await tx
          .delete(mediaAssetTagTable)
          .where(eq(mediaAssetTagTable.mediaAssetId, input.mediaId));
        const [moved] = await tx
          .update(mediaAssetTable)
          .set({
            brandId: input.brandId,
            folderId: null,
            updatedAt: new Date(),
          })
          .where(eq(mediaAssetTable.id, input.mediaId))
          .returning();
        return moved;
      });
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
        boardCount: z
          .number()
          .int()
          .min(0)
          .max(MAX_STORYBOARD_BOARDS)
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      return MediaService.createR2Upload({
        ...input,
        uploadedBy: ctx.session.user.id,
      });
    }),

  /** Record an upload whose bytes never arrived, so it stops reading as pending. */
  failUpload: protectedProcedure
    .input(
      z.object({ mediaId: z.string(), reason: z.string().max(500).optional() }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMediaAccess(ctx, input.mediaId);
      return MediaService.failR2Upload(input.mediaId, input.reason);
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
        storyboard: storyboardDescriptorSchema.optional(),
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
      if ((asset.kind !== "image" && asset.kind !== "video") || !asset.url) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only ready images and videos can be analyzed",
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
