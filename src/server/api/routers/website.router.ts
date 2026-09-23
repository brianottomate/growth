import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { brandTable, memberTable } from "@/server/db/schema";
import { auditBrandWebsite } from "@/server/services/website-sync.service";

import { protectedProcedure, actionProcedure } from "@/server/api/orpc";
import { syncBrandWebsite as syncBrandWebsiteAction } from "@/server/ai/capabilities/operations";

export const websiteRouter = {
  audit: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      const brand = await ctx.db.query.brandTable.findFirst({
        where: eq(brandTable.id, input.brandId),
      });
      if (!brand?.organizationId) {
        throw new ORPCError("NOT_FOUND", { message: "Owned brand not found" });
      }
      const membership = await ctx.db.query.memberTable.findFirst({
        where: and(
          eq(memberTable.userId, ctx.session.user.id),
          eq(memberTable.organizationId, brand.organizationId),
        ),
      });
      if (!membership) throw new ORPCError("FORBIDDEN");
      if (!brand.website) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Add a website before running its live audit",
        });
      }
      return auditBrandWebsite({ website: brand.website });
    }),
  sync: actionProcedure(syncBrandWebsiteAction),
};
