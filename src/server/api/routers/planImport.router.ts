import type { Database } from "@/server/db";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  brandTable,
  memberTable,
  planImportItemTable,
  planImportTable,
  seriesTable,
} from "@/server/db/schema";
import {
  clusterWorkbookRows,
  parseWorkbookRows,
} from "@/server/services/plan-import-parse.service";
import {
  findDuplicateHints,
  loadOpenSlots,
  matchIdeasToSlots,
} from "@/server/services/plan-import-match.service";
import { applyImport } from "@/server/services/plan-import-apply.service";

type Ctx = {
  db: Database;
  session: { user: { id: string } };
};

/** Resolve the brand and assert the caller is a member of its org. */
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
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No access to this brand",
    });
  }
  return brand;
}

async function getImportOrThrow(ctx: Ctx, importId: string) {
  const imp = await ctx.db.query.planImportTable.findFirst({
    where: eq(planImportTable.id, importId),
  });
  if (!imp) throw new TRPCError({ code: "NOT_FOUND" });
  await assertBrandAccess(ctx, imp.brandId);
  return imp;
}

const itemStatusEnum = z.enum([
  "pending",
  "accepted",
  "accepted_refine",
  "rejected",
]);

export const planImportRouter = createTRPCRouter({
  /**
   * Paste → parse → cluster (one AI call) → match → persisted suggestion
   * items. Synchronous: same latency class as moment.generate (~30-60s for a
   * month workbook). On failure the import row survives as status="failed"
   * with the raw paste intact.
   */
  createFromPaste: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        rawText: z.string().min(50).max(200_000),
        month: z.string().regex(/^\d{4}-\d{2}$/),
        source: z.string().max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const brand = await assertBrandAccess(ctx, input.brandId);

      const [imp] = await ctx.db
        .insert(planImportTable)
        .values({
          brandId: input.brandId,
          rawText: input.rawText,
          month: input.month,
          source: input.source ?? "paste",
          status: "parsing",
          createdById: ctx.session.user.id,
        })
        .returning({ id: planImportTable.id });
      if (!imp) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        const { rows } = parseWorkbookRows(input.rawText);
        const members = (
          await ctx.db.query.memberTable.findMany({
            where: eq(memberTable.organizationId, brand.organizationId!),
            with: { user: { columns: { id: true, name: true } } },
          })
        ).map((m) => ({ id: m.user.id, name: m.user.name }));
        const knownSeries = (
          await ctx.db.query.seriesTable.findMany({
            where: and(
              eq(seriesTable.brandId, brand.id),
              isNull(seriesTable.deletedAt),
            ),
            columns: { name: true },
          })
        ).map((s) => s.name);

        const { ideas } = await clusterWorkbookRows({
          rows,
          month: input.month,
          brandSlug: brand.slug ?? "",
          members,
          knownSeries,
        });
        const slots = await loadOpenSlots(brand.id, input.month);
        const results = matchIdeasToSlots(ideas, slots);
        const dupes = await findDuplicateHints(ideas, brand.id, input.month);

        for (const [i, idea] of ideas.entries()) {
          const res = results[i]!;
          await ctx.db.insert(planImportItemTable).values({
            importId: imp.id,
            brandId: brand.id,
            payload: {
              ...idea,
              duplicateOfContentPostId: dupes.get(i) ?? null,
            },
            kind: res.kind,
            matchedSlots: res.matches,
            unmatchedPlatforms: res.unmatchedPlatforms,
            confidence: res.confidence,
            reasoning: res.reasoning,
          });
        }

        await ctx.db
          .update(planImportTable)
          .set({ status: "ready" })
          .where(eq(planImportTable.id, imp.id));

        return {
          importId: imp.id,
          itemCount: ideas.length,
          fillCount: results.filter((r) => r.kind === "fill_slots").length,
          newIdeaCount: results.filter((r) => r.kind === "new_idea").length,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await ctx.db
          .update(planImportTable)
          .set({ status: "failed", error: message })
          .where(eq(planImportTable.id, imp.id));
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Import failed: ${message}`,
        });
      }
    }),

  /** Import + items + the month's open slots (annotated with which item
   *  consumes each) — the review page's single query. Gaps compute
   *  client-side so they react to optimistic decisions. */
  get: protectedProcedure
    .input(z.object({ importId: z.string() }))
    .query(async ({ ctx, input }) => {
      const imp = await getImportOrThrow(ctx, input.importId);
      const items = await ctx.db.query.planImportItemTable.findMany({
        where: eq(planImportItemTable.importId, imp.id),
        orderBy: [planImportItemTable.createdAt],
      });
      const slots = await loadOpenSlots(imp.brandId, imp.month);
      const consumedBy = new Map<string, string>();
      for (const item of items) {
        for (const m of item.matchedSlots ?? []) {
          if (!consumedBy.has(m.contentPostId))
            consumedBy.set(m.contentPostId, item.id);
        }
      }
      return {
        import: imp,
        items: items.sort((a, b) =>
          (a.payload.date ?? "9999").localeCompare(b.payload.date ?? "9999"),
        ),
        slots: slots.map((s) => ({
          ...s,
          consumedByItemId: consumedBy.get(s.contentPostId) ?? null,
        })),
      };
    }),

  /** Imports for the org's brands, newest first, with item tallies. */
  list: protectedProcedure
    .input(z.object({ brandId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const imports = await ctx.db.query.planImportTable.findMany({
        where: input?.brandId
          ? eq(planImportTable.brandId, input.brandId)
          : undefined,
        orderBy: [desc(planImportTable.createdAt)],
        limit: 20,
        with: { items: { columns: { status: true } } },
      });
      // Cheap org filter: assertBrandAccess per distinct brand.
      const out = [];
      const okBrands = new Set<string>();
      for (const imp of imports) {
        if (!okBrands.has(imp.brandId)) {
          try {
            await assertBrandAccess(ctx, imp.brandId);
            okBrands.add(imp.brandId);
          } catch {
            continue;
          }
        }
        const tally = {
          pending: 0,
          accepted: 0,
          accepted_refine: 0,
          rejected: 0,
        };
        for (const it of imp.items) tally[it.status]++;
        const { items: _items, rawText: _raw, ...rest } = imp;
        out.push({ ...rest, tally, itemCount: imp.items.length });
      }
      return out;
    }),

  /** Persist review decisions — single or bulk through one procedure. */
  setItemStatus: protectedProcedure
    .input(
      z.object({
        itemIds: z.array(z.string()).min(1).max(100),
        status: itemStatusEnum,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated: string[] = [];
      for (const id of input.itemIds) {
        const item = await ctx.db.query.planImportItemTable.findFirst({
          where: eq(planImportItemTable.id, id),
        });
        if (!item) continue;
        await assertBrandAccess(ctx, item.brandId);
        if (item.appliedContentPostId) continue; // already materialized
        await ctx.db
          .update(planImportItemTable)
          .set({
            status: input.status,
            reviewedById: ctx.session.user.id,
            reviewedAt: new Date(),
          })
          .where(eq(planImportItemTable.id, id));
        updated.push(id);
      }
      return { updated };
    }),

  /** The single write moment: materialize every accepted item.
   *  (Named `applyImport` — `apply` is a tRPC-reserved procedure name.) */
  applyImport: protectedProcedure
    .input(z.object({ importId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const imp = await getImportOrThrow(ctx, input.importId);
      if (imp.status === "failed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Import failed to parse",
        });
      }
      const result = await applyImport({
        importId: imp.id,
        userId: ctx.session.user.id,
      });
      return result;
    }),
});
