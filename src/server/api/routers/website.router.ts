import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { brandTable, memberTable } from "@/server/db/schema";
import {
  auditBrandWebsite,
  syncBrandWebsite,
} from "@/server/services/website-sync.service";

import { createTRPCRouter, protectedProcedure } from "../trpc";

export const websiteRouter = createTRPCRouter({
  audit: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const brand = await ctx.db.query.brandTable.findFirst({
        where: eq(brandTable.id, input.brandId),
      });
      if (!brand?.organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Owned brand not found",
        });
      }
      const membership = await ctx.db.query.memberTable.findFirst({
        where: and(
          eq(memberTable.userId, ctx.session.user.id),
          eq(memberTable.organizationId, brand.organizationId),
        ),
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      if (!brand.website) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add a website before running its live audit",
        });
      }
      return auditBrandWebsite({ website: brand.website });
    }),
  sync: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const brand = await ctx.db.query.brandTable.findFirst({
        where: eq(brandTable.id, input.brandId),
      });
      if (!brand?.organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Owned brand not found",
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
          message: "You do not have access to this brand",
        });
      }
      if (!brand.website) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add a website to this brand before syncing its sitemap",
        });
      }
      return syncBrandWebsite({ brandId: brand.id, website: brand.website });
    }),
});
