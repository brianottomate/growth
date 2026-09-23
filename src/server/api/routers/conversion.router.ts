import type { Database } from "@/server/db";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

import { protectedProcedure } from "@/server/api/orpc";
import {
  brandTable,
  conversionEventTable,
  conversionMappingTable,
  conversionModeEnum,
  conversionStatusEnum,
  memberTable,
} from "@/server/db/schema";

type Ctx = {
  db: Database;
  session: { user: { id: string } };
};

async function getOrgId(ctx: Ctx) {
  const membership = await ctx.db.query.memberTable.findFirst({
    where: eq(memberTable.userId, ctx.session.user.id),
  });
  if (!membership?.organizationId) {
    throw new ORPCError("FORBIDDEN", { message: "No organization" });
  }
  return membership.organizationId;
}

async function orgBrandIds(ctx: Ctx, orgId: string) {
  const brands = await ctx.db.query.brandTable.findMany({
    where: eq(brandTable.organizationId, orgId),
    columns: { id: true },
  });
  return brands.map((b) => b.id);
}

async function assertMappingAccess(ctx: Ctx, mappingId: string) {
  const mapping = await ctx.db.query.conversionMappingTable.findFirst({
    where: eq(conversionMappingTable.id, mappingId),
  });
  if (!mapping) throw new ORPCError("NOT_FOUND");
  const orgId = await getOrgId(ctx);
  const brandIds = await orgBrandIds(ctx, orgId);
  if (!brandIds.includes(mapping.brandId)) {
    throw new ORPCError("FORBIDDEN", { message: "No access to mapping" });
  }
  return mapping;
}

const statusSchema = z.enum(conversionStatusEnum.enumValues);
const modeSchema = z.enum(conversionModeEnum.enumValues);

export const conversionRouter = {
  /**
   * The full conversion-tracking matrix for the org: canonical events (the
   * intent spine) + per-platform mappings with their feeding events and ad
   * channel. The /app/ads page assembles event×platform cells from this.
   */
  matrix: protectedProcedure.handler(async ({ context: ctx }) => {
    const orgId = await getOrgId(ctx);
    const brandIds = await orgBrandIds(ctx, orgId);
    if (brandIds.length === 0) return { events: [], mappings: [] };

    const [events, mappings] = await Promise.all([
      ctx.db.query.conversionEventTable.findMany({
        where: inArray(conversionEventTable.brandId, brandIds),
      }),
      ctx.db.query.conversionMappingTable.findMany({
        where: inArray(conversionMappingTable.brandId, brandIds),
        with: {
          sources: true,
          channel: { columns: { platform: true, manageUrl: true } },
        },
      }),
    ]);

    return { events, mappings };
  }),

  /** Flip a mapping's reality status (and stamp when it was checked). */
  setStatus: protectedProcedure
    .input(z.object({ id: z.string(), status: statusSchema }))
    .handler(async ({ context: ctx, input }) => {
      await assertMappingAccess(ctx, input.id);
      const [updated] = await ctx.db
        .update(conversionMappingTable)
        .set({ status: input.status, lastCheckedAt: new Date() })
        .where(eq(conversionMappingTable.id, input.id))
        .returning();
      return updated;
    }),

  /** Edit the sheet-derived fields of a mapping (id/notes/conversion id/mode). */
  updateMapping: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        externalConversionId: z.string().max(200).nullish(),
        mode: modeSchema.nullish(),
        notes: z.string().max(2000).nullish(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      await assertMappingAccess(ctx, input.id);
      const { id, ...rest } = input;
      const [updated] = await ctx.db
        .update(conversionMappingTable)
        .set(rest)
        .where(eq(conversionMappingTable.id, id))
        .returning();
      return updated;
    }),
};
