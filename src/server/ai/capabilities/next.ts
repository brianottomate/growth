import "server-only";

import { z } from "zod";
import { and, count, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  cadenceTargetTable,
  mixTargetTable,
  platformPostTable,
} from "@/server/db/schema";
import { getBrandSurfaceSummary } from "@/server/services/brand-map.service";
import { defineCapability } from "./types";
import { requireOwnedBrand } from "./brand-access";
import { productionQueue, upcomingContent } from "./content";

/** One grounded answer to “what is next for this brand?” */
export const nextForBrand = defineCapability({
  name: "nextForBrand",
  description:
    "Read one owned brand's readiness and the next 14 days in a single call: mapped surfaces, owned post history, active content mix and cadence targets, and already planned content. Call this FIRST for 'what's next for this brand?', before recommending setup, research, or planning work.",
  inputSchema: z.object({ brandId: z.string() }),
  readOnly: true,
  domain: "overview",
  execute: async ({ brandId }, ctx) => {
    const brand = await requireOwnedBrand(brandId, ctx);
    const [surfaces, historyRows, mix, cadence, upcoming, production] =
      await Promise.all([
        getBrandSurfaceSummary(brandId),
        db
          .select({
            count: count(),
            earliest: sql<Date | null>`min(coalesce(${platformPostTable.publishedAt}, ${platformPostTable.createdAt}))`,
            latest: sql<Date | null>`max(coalesce(${platformPostTable.publishedAt}, ${platformPostTable.createdAt}))`,
          })
          .from(platformPostTable)
          .where(
            and(
              eq(platformPostTable.brandId, brandId),
              eq(platformPostTable.source, "owned"),
            ),
          ),
        db.query.mixTargetTable.findMany({
          where: and(
            eq(mixTargetTable.brandId, brandId),
            eq(mixTargetTable.isActive, true),
            isNull(mixTargetTable.channelId),
          ),
          columns: { pillar: true, targetPct: true, period: true },
        }),
        db.query.cadenceTargetTable.findMany({
          where: and(
            eq(cadenceTargetTable.brandId, brandId),
            eq(cadenceTargetTable.isActive, true),
            isNull(cadenceTargetTable.deletedAt),
          ),
          columns: {
            platform: true,
            archetype: true,
            count: true,
            period: true,
          },
        }),
        upcomingContent.execute({ brandId, days: 14, limit: 50 }, ctx),
        productionQueue.execute({ brandId, days: 14 }, ctx),
      ]);

    const history = historyRows[0] ?? {
      count: 0,
      earliest: null,
      latest: null,
    };
    const planned =
      upcoming.posts.length + (upcoming.standalonePlatformPosts?.length ?? 0);
    const gaps = [
      surfaces.channels === 0 ? "channels" : null,
      history.count === 0 ? "owned post history" : null,
      !surfaces.hasStrategyTargets ? "content mix and cadence" : null,
    ].filter((gap): gap is string => gap !== null);

    return {
      brand: { id: brand.id, name: brand.name, tagline: brand.tagline },
      horizonDays: 14,
      readiness: {
        readyToPlan: gaps.length === 0,
        gaps,
        surfaces,
        ownedHistory: history,
      },
      strategy: { mix, cadence },
      upcoming,
      production,
      recommendation:
        gaps.length > 0
          ? `Resolve ${gaps[0]} before generating a schedule.`
          : planned === 0
            ? "The context is ready and the next 14 days are empty. Preview a two-week slot plan."
            : production.items.some((item) => !item.readyForReview)
              ? `There are ${planned} planned items. Work the nearest incomplete production item before adding more.`
              : `There are ${planned} planned items and their production requirements are complete. Move them through review.`,
      contentUrl: `/app/content?brandId=${brandId}&view=schedule`,
      calendarUrl: `/app/calendar?brand=${brandId}`,
    };
  },
});
