import type { Database } from "@/server/db";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

import { protectedProcedure } from "@/server/api/orpc";
import {
  brandTable,
  channelPlatformEnum,
  contentPostTable,
  memberTable,
  platformPostTable,
} from "@/server/db/schema";
import {
  archetypeForFormat,
  platformFormatsFor,
} from "@/server/content/formats";
import { generateReschedule } from "@/server/services/reschedule.service";
import type { ChannelPlatform } from "@/server/db/channel-schema";

type Ctx = {
  db: Database;
  session: { user: { id: string } };
};

/** Ensure the caller belongs to the org that owns the brand (owned, not tracked). */
async function assertBrandAccess(ctx: Ctx, brandId: string) {
  const brand = await ctx.db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
    columns: { organizationId: true },
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
  if (!membership) throw new ORPCError("FORBIDDEN");
}

const VALID_PLATFORMS = new Set<string>(channelPlatformEnum.enumValues);
const noon = (ymd: string) => new Date(`${ymd}T12:00:00`);

export const rescheduleRouter = {
  /** Generate a reshuffle proposal (no writes) — moves + slot fills to review. */
  generate: protectedProcedure
    .input(z.object({ brandId: z.string(), year: z.number().int() }))
    .handler(async ({ context: ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);
      const { plan, spots } = await generateReschedule(
        input.brandId,
        input.year,
      );
      const byId = new Map(spots.map((s) => [s.id, s]));
      const moves = plan.moves
        .map((m) => {
          const s = byId.get(m.spotId);
          if (!s || s.date === m.toDate) return null; // unknown / no-op
          return {
            spotId: m.spotId,
            toDate: m.toDate,
            fromDate: s.date,
            reason: m.reason,
            platform: s.platform,
            title: s.title,
          };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null);
      const slots = plan.slots.filter((s) => VALID_PLATFORMS.has(s.platform));
      return { moves, slots };
    }),

  /** Apply the accepted moves + slots. Moves re-date owned spots; slots mint
   *  empty `status:"slot"` placeholders (idea + one channel spot) on the day.
   *  */
  applyPlan: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        moves: z.array(z.object({ spotId: z.string(), toDate: z.string() })),
        slots: z.array(
          z.object({
            date: z.string(),
            platform: z.string(),
            pillar: z.string().optional(),
            title: z.string().optional(),
          }),
        ),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      await assertBrandAccess(ctx, input.brandId);

      let moved = 0;
      if (input.moves.length) {
        const ids = input.moves.map((m) => m.spotId);
        const owned = await ctx.db.query.platformPostTable.findMany({
          where: and(
            inArray(platformPostTable.id, ids),
            eq(platformPostTable.brandId, input.brandId),
            eq(platformPostTable.source, "owned"),
          ),
          columns: { id: true },
        });
        const ok = new Set(owned.map((s) => s.id));
        for (const m of input.moves) {
          if (!ok.has(m.spotId)) continue;
          await ctx.db
            .update(platformPostTable)
            .set({ scheduledAt: noon(m.toDate) })
            .where(eq(platformPostTable.id, m.spotId));
          moved++;
        }
      }

      let created = 0;
      for (const slot of input.slots) {
        if (!VALID_PLATFORMS.has(slot.platform)) continue;
        const format = platformFormatsFor(slot.platform as ChannelPlatform)[0]
          ?.id;
        const [idea] = await ctx.db
          .insert(contentPostTable)
          .values({
            brandId: input.brandId,
            title: slot.title ?? null,
            pillar: slot.pillar,
            status: "slot",
            slotKind: "freeflow",
            origin: "ai",
            plannedAt: noon(slot.date),
            targetSpots: format
              ? [
                  {
                    platform: slot.platform,
                    format,
                    archetype: archetypeForFormat(format) ?? "",
                  },
                ]
              : undefined,
          })
          .returning({ id: contentPostTable.id });
        if (idea) {
          await ctx.db.insert(platformPostTable).values({
            brandId: input.brandId,
            contentPostId: idea.id,
            platform: slot.platform as ChannelPlatform,
            format,
            archetype: format ? archetypeForFormat(format) : undefined,
            source: "owned",
            status: "slot",
            origin: "ai",
            scheduledAt: noon(slot.date),
          });
        }
        created++;
      }

      return { moved, created };
    }),
};
