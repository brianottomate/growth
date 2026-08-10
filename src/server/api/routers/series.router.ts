import type { Database } from "@/server/db";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { brandTable, memberTable, seriesTable } from "@/server/db/schema";
import {
  clearBrandSeries,
  purgeSeries,
} from "@/server/services/content-strategy.service";

type Ctx = {
  db: Database;
  session: { user: { id: string } };
};

/** Resolves the brand's org and asserts the caller is a member of it. */
async function assertBrandAccess(ctx: Ctx, brandId: string) {
  const brand = await ctx.db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
    columns: { organizationId: true },
  });
  const membership = brand?.organizationId
    ? await ctx.db.query.memberTable.findFirst({
        where: and(
          eq(memberTable.userId, ctx.session.user.id),
          eq(memberTable.organizationId, brand.organizationId),
        ),
      })
    : null;
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No access to this brand",
    });
  }
}

export const seriesRouter = createTRPCRouter({
  /** Delete one series for good. Its ideas detach rather than disappear. */
  purge: protectedProcedure
    .input(z.object({ seriesId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const series = await ctx.db.query.seriesTable.findFirst({
        where: eq(seriesTable.id, input.seriesId),
        columns: { id: true, brandId: true },
      });
      if (!series) throw new TRPCError({ code: "NOT_FOUND" });
      await assertBrandAccess(ctx, series.brandId);
      return purgeSeries({ seriesId: series.id });
    }),

  /** Clean slate for one brand's series shelf. */
  clearForBrand: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      return clearBrandSeries({ brandId: input.brandId });
    }),
});
