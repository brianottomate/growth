import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import type { Database } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { GoogleDriveService } from "@/server/services/google-drive.service";
import { GoogleDriveError } from "@/server/clients/google-drive.client";
import { DRIVE_READONLY_SCOPE } from "@/lib/google-drive";

type Ctx = {
  db: Database;
  session: { user: { id: string } };
};

/** Same brand-membership gate the media router uses. */
async function assertBrandAccess(ctx: Ctx, brandId: string) {
  const brand = await ctx.db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
  });
  if (!brand?.organizationId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
  }
  const membership = await ctx.db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.userId, ctx.session.user.id),
      eq(memberTable.organizationId, brand.organizationId),
    ),
  });
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No access to brand" });
  }
  return brand;
}

/** Drive failures are expected (revoked consent, deleted file) — not 500s. */
function asTRPCError(error: unknown): TRPCError {
  if (error instanceof GoogleDriveError) {
    return new TRPCError({
      code:
        error.status === 401 || error.status === 403
          ? "FORBIDDEN"
          : "BAD_REQUEST",
      message: error.message,
    });
  }
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: error instanceof Error ? error.message : "Google Drive failed.",
  });
}

export const googleDriveRouter = createTRPCRouter({
  /**
   * Whether this user can browse Drive, and the scope the UI must request if
   * not. Cheap enough to call on every render of the media page.
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    const connection = await GoogleDriveService.connection(ctx.session.user.id);
    return { ...connection, scope: DRIVE_READONLY_SCOPE };
  }),

  browse: protectedProcedure
    .input(
      z.object({
        folderId: z.string().min(1).max(200).optional(),
        search: z.string().trim().max(200).optional(),
        includeFolders: z.boolean().default(true),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await GoogleDriveService.browse({
          userId: ctx.session.user.id,
          ...input,
        });
      } catch (error) {
        throw asTRPCError(error);
      }
    }),

  importFiles: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        // Order is meaningful — it becomes the carousel order downstream.
        fileIds: z.array(z.string().min(1).max(200)).min(1).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      try {
        const result = await GoogleDriveService.importFiles({
          userId: ctx.session.user.id,
          brandId: input.brandId,
          fileIds: input.fileIds,
        });
        return {
          imported: result.imported.length,
          failures: result.failures,
          assets: result.imported,
        };
      } catch (error) {
        throw asTRPCError(error);
      }
    }),

  importFolder: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        folderId: z.string().min(1).max(200),
        limit: z.number().int().min(1).max(50).default(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      try {
        const result = await GoogleDriveService.importFolder({
          userId: ctx.session.user.id,
          brandId: input.brandId,
          folderId: input.folderId,
          limit: input.limit,
        });
        return {
          imported: result.imported.length,
          failures: result.failures,
          assets: result.imported,
        };
      } catch (error) {
        throw asTRPCError(error);
      }
    }),
});
