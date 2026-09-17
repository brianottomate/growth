import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import type { db } from "@/server/db";
import { brandTable, memberTable, personaTable } from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { demandGeographySchema } from "@/lib/persona-geography";

// ---- PERSONAS ----------------------------------------------------------
//
// The stable brand-level "who" — the people counterpart of content pillars.
// Loose planning metadata only; the strict, buyable narrowing lives on a
// campaign's audiences, which may point back here via personaId.

type Ctx = {
  db: typeof db;
  session: { user: { id: string } };
};

async function assertBrandManageable(ctx: Ctx, brandId: string) {
  const brand = await ctx.db.query.brandTable.findFirst({
    where: and(eq(brandTable.id, brandId), isNull(brandTable.deletedAt)),
    columns: { id: true, organizationId: true },
  });
  if (!brand?.organizationId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
  }
  const membership = await ctx.db.query.memberTable.findFirst({
    where: eq(memberTable.userId, ctx.session.user.id),
    columns: { organizationId: true },
  });
  if (brand.organizationId !== membership?.organizationId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No access to this brand",
    });
  }
  return brand;
}

const name = z.string().trim().min(1).max(200);
const description = z.string().trim().max(2000).nullish();
const ageRanges = z.array(z.string().trim().min(1).max(40)).max(10).nullish();
const geographies = z
  .array(z.string().trim().min(1).max(100))
  .max(20)
  .nullish();
const demandGeography = demandGeographySchema.nullish();
const notes = z.string().trim().max(4000).nullish();

async function requirePersona(ctx: Ctx, personaId: string) {
  const persona = await ctx.db.query.personaTable.findFirst({
    where: eq(personaTable.id, personaId),
    columns: { id: true, brandId: true },
  });
  if (!persona) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Persona not found" });
  }
  await assertBrandManageable(ctx, persona.brandId);
  return persona;
}

export const personaRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      return ctx.db.query.personaTable.findMany({
        where: and(
          eq(personaTable.brandId, input.brandId),
          isNull(personaTable.deletedAt),
        ),
        orderBy: [asc(personaTable.createdAt)],
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        name,
        description,
        ageRanges,
        geographies,
        demandGeography,
        notes,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      const [persona] = await ctx.db
        .insert(personaTable)
        .values({
          id: createId("pers"),
          brandId: input.brandId,
          name: input.name,
          description: input.description ?? null,
          ageRanges: input.ageRanges ?? null,
          geographies: input.geographies ?? null,
          demandGeography: input.demandGeography ?? null,
          notes: input.notes ?? null,
        })
        .returning();
      return persona!;
    }),

  update: protectedProcedure
    .input(
      z.object({
        personaId: z.string(),
        name: name.optional(),
        description,
        ageRanges,
        geographies,
        demandGeography,
        notes,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const persona = await requirePersona(ctx, input.personaId);
      const { personaId: _id, ...patch } = input;
      const [updated] = await ctx.db
        .update(personaTable)
        .set(patch)
        .where(eq(personaTable.id, persona.id))
        .returning();
      return updated!;
    }),

  delete: protectedProcedure
    .input(z.object({ personaId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const persona = await requirePersona(ctx, input.personaId);
      // Soft delete: campaign audiences pointing here keep their lineage.
      const [deleted] = await ctx.db
        .update(personaTable)
        .set({ deletedAt: new Date() })
        .where(eq(personaTable.id, persona.id))
        .returning({ id: personaTable.id });
      return deleted!;
    }),
});
