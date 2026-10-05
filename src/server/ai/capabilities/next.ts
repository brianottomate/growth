import {
  nextForBrandNativeResultSchema,
  nextForBrandOutputSchema,
} from "./outputs/next";

import "server-only";

import { z } from "zod";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  cadenceTargetTable,
  channelTable,
  mixTargetTable,
  platformPostTable,
} from "@/server/db/schema";
import { getBrandSurfaceSummary } from "@/server/services/brand-map.service";
import { platformFormatsFor } from "@/server/content/formats";
import { PILLARS } from "@/lib/pillars";
import { growthAction } from "./types";
import { requireOwnedBrand } from "./brand-access";
import { productionQueue, upcomingContent } from "./content";

/** One grounded answer to “what is next for this brand?” */
export const nextForBrand = growthAction({
  nativeOutputSchema: nextForBrandNativeResultSchema,
  outputSchema: nextForBrandOutputSchema,
  description:
    "Read one owned brand's readiness and the next 14 days in a single call: mapped surfaces, owned post history, active content mix and cadence targets, and already planned content. Call this FIRST for 'what's next for this brand?', before recommending setup, research, or planning work.",
  inputSchema: z.object({ brandId: z.string() }),
  execute: async ({ brandId }, ctx) => {
    const brand = await requireOwnedBrand(brandId, ctx);
    const [
      surfaces,
      historyRows,
      mix,
      cadence,
      publishingChannels,
      upcoming,
      production,
    ] = await Promise.all([
      getBrandSurfaceSummary(brandId),
      db
        .select({
          count: count(),
          earliest:
            sql<Date | null>`min(coalesce(${platformPostTable.publishedAt}, ${platformPostTable.createdAt}))`.mapWith(
              (value: string | null): Date | null =>
                value === null ? null : new Date(value),
            ),
          latest:
            sql<Date | null>`max(coalesce(${platformPostTable.publishedAt}, ${platformPostTable.createdAt}))`.mapWith(
              (value: string | null): Date | null =>
                value === null ? null : new Date(value),
            ),
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
          channelId: true,
          platform: true,
          archetype: true,
          count: true,
          period: true,
        },
      }),
      db.query.channelTable.findMany({
        where: and(
          eq(channelTable.brandId, brandId),
          inArray(channelTable.kind, ["social", "blog", "newsletter"]),
          eq(channelTable.isActive, true),
          isNull(channelTable.deletedAt),
        ),
        columns: { id: true, platform: true, handle: true },
      }),
      upcomingContent.run({ brandId, days: 14, limit: 50 }, ctx),
      productionQueue.run({ brandId, days: 14 }, ctx),
    ]);

    const history = historyRows[0] ?? {
      count: 0,
      earliest: null,
      latest: null,
    };
    const planned =
      upcoming.posts.length + (upcoming.standalonePlatformPosts?.length ?? 0);
    const plannableChannels = publishingChannels.filter(
      (channel) => platformFormatsFor(channel.platform).length > 0,
    );
    const configuredChannelIds = new Set(
      cadence.map((target) => target.channelId),
    );
    const unconfiguredChannels = plannableChannels.filter(
      (channel) => !configuredChannelIds.has(channel.id),
    );
    const availablePillars = PILLARS.filter(
      (pillar) => pillar.brandSlug === brand.slug,
    ).map(({ slug, name, description }) => ({ slug, name, description }));
    const gaps = [
      plannableChannels.length === 0 ? "publishing channels" : null,
      history.count === 0 ? "owned post history" : null,
      mix.length === 0 ? "content mix" : null,
      unconfiguredChannels.length > 0
        ? `cadence for ${unconfiguredChannels.map((channel) => channel.platform).join(", ")}`
        : null,
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
      strategy: {
        mix,
        cadence,
        availablePillars,
        unconfiguredChannels,
      },
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
