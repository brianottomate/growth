import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

import { protectedProcedure, actionProcedure } from "@/server/api/orpc";
import type { Database } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { GoogleDriveService } from "@/server/services/google-drive.service";
import { GoogleDriveError } from "@/server/clients/google-drive.client";
import {
  browseDrive,
  driveConnectionStatus,
} from "@/server/ai/capabilities/drive";

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
    throw new ORPCError("NOT_FOUND", { message: "Brand not found" });
  }
  const membership = await ctx.db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.userId, ctx.session.user.id),
      eq(memberTable.organizationId, brand.organizationId),
    ),
  });
  if (!membership) {
    throw new ORPCError("FORBIDDEN", { message: "No access to brand" });
  }
  return brand;
}

/** Drive failures are expected (revoked consent, deleted file) — not 500s. */
function asORPCError(error: unknown) {
  if (error instanceof GoogleDriveError) {
    return new ORPCError(
      error.status === 401 || error.status === 403
        ? "FORBIDDEN"
        : "BAD_REQUEST",
      { message: error.message },
    );
  }
  return new ORPCError("INTERNAL_SERVER_ERROR", {
    message: error instanceof Error ? error.message : "Google Drive failed.",
  });
}

export const googleDriveRouter = {
  /**
   * Whether this user can browse Drive, and the scope the UI must request if
   * not. Cheap enough to call on every render of the media page.
   */
  status: actionProcedure(driveConnectionStatus),

  browse: actionProcedure(browseDrive),

  importFiles: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        // Order is meaningful — it becomes the carousel order downstream.
        fileIds: z.array(z.string().min(1).max(200)).min(1).max(50),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
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
        throw asORPCError(error);
      }
    }),
};
