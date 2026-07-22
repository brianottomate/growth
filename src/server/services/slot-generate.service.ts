import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";

import { db } from "@/server/db";
import {
  cadenceTargetTable,
  channelTable,
  contentPostTable,
  mixTargetTable,
  platformPostTable,
  seriesTable,
} from "@/server/db/schema";
import type { ChannelPlatform } from "@/server/db/channel-schema";
import { platformFormatsFor } from "@/server/content/formats";
import { PILLAR_BY_SLUG } from "@/lib/pillars";

/**
 * Slot generator — the strategy→calendar computation.
 *
 * Expands the brand's cadence_target rows into a month of empty, strategy-
 * anchored `status:"slot"` content_posts (slotKind:"cadence", idea + one
 * channel spot each — same shape reschedule.applyPlan mints), and assigns
 * pillars from mix_target (channel override, else brand default).
 *
 * Idempotent top-up: existing cadence slots in the month count against each
 * channel × archetype total, so re-running after target edits only adds the
 * difference. Filled/claimed slots (status has moved on) also count — a
 * claimed slot still occupies its place in the month's rhythm.
 */

// Targets tracked on /channels but excluded from slot planning, keyed
// "platform|archetype". Empty as of 2026-07-03: X texts were excluded as
// amplification-grade, but Kristian wants the full planned-tweet lane.
const NOT_SLOT_PLANNED = new Set<string>([]);

const atNoon = (start: Date, dayOffset: number) => {
  const date = new Date(start);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(12, 0, 0, 0);
  return date;
};

/** Slots a period target implies for a bounded planning window. */
function rangeTotal(
  count: number,
  period: string,
  days: number,
  fullMonth: boolean,
): number {
  if (period === "day") return count * days;
  if (period === "week") return Math.round((count * days) / 7);
  return fullMonth ? count : Math.round((count * days) / 30.4375);
}

export type SlotGenRow = {
  platform: string;
  archetype: string;
  // The target as authored (the team thinks in weekly rhythm)…
  count: number;
  period: string; // "day" | "week" | "month"
  // …and what it implies for this month.
  target: number;
  existing: number;
  created: number;
  // Set when the row comes from a series-scoped target rather than the
  // channel baseline.
  series?: string | null;
};

/** The resolved pillar mix a channel's slots are allocated from (its
 *  mix_target override, else the brand default), as display percentages. */
export type SlotGenMix = {
  platform: string;
  isOverride: boolean;
  pillars: { pillar: string; pct: number }[];
};

export type UnconfiguredChannel = {
  channelId: string;
  platform: string;
  handle: string | null;
};

type SlotGenerationResult = {
  rows: SlotGenRow[];
  created: number;
  mix: SlotGenMix[];
  unconfiguredChannels: UnconfiguredChannel[];
  unconfiguredMixChannels: UnconfiguredChannel[];
};

export async function generateMonthSlots(opts: {
  brandId: string;
  year: number;
  month: number; // 1-12
  dryRun?: boolean;
}): Promise<SlotGenerationResult> {
  const { brandId, year, month, dryRun } = opts;
  return generateSlotsForRange({
    brandId,
    rangeStart: new Date(year, month - 1, 1),
    rangeEnd: new Date(year, month, 1),
    dryRun,
    fullMonth: true,
  });
}

export async function generateRangeSlots(opts: {
  brandId: string;
  rangeStart: Date;
  rangeEnd: Date;
  dryRun?: boolean;
}): Promise<SlotGenerationResult> {
  return generateSlotsForRange({ ...opts, fullMonth: false });
}

async function generateSlotsForRange(opts: {
  brandId: string;
  rangeStart: Date;
  rangeEnd: Date;
  dryRun?: boolean;
  fullMonth: boolean;
}): Promise<SlotGenerationResult> {
  const { brandId, rangeStart, rangeEnd, dryRun, fullMonth } = opts;
  const days = Math.max(
    1,
    Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000),
  );

  const [cadence, mix, existingSlots, channels] = await Promise.all([
    db.query.cadenceTargetTable.findMany({
      where: and(
        eq(cadenceTargetTable.brandId, brandId),
        eq(cadenceTargetTable.isActive, true),
        isNull(cadenceTargetTable.deletedAt),
      ),
    }),
    db.query.mixTargetTable.findMany({
      where: and(
        eq(mixTargetTable.brandId, brandId),
        eq(mixTargetTable.isActive, true),
      ),
    }),
    db.query.platformPostTable.findMany({
      where: and(
        eq(platformPostTable.brandId, brandId),
        eq(platformPostTable.source, "owned"),
        gte(platformPostTable.scheduledAt, rangeStart),
        lt(platformPostTable.scheduledAt, rangeEnd),
      ),
      columns: { platform: true, archetype: true, contentPostId: true },
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
  ]);

  const planningChannels = channels.filter(
    (channel) => platformFormatsFor(channel.platform).length > 0,
  );
  const activeChannelIds = new Set(
    planningChannels.map((channel) => channel.id),
  );
  const cadenceForPlanning = cadence.filter((target) =>
    activeChannelIds.has(target.channelId),
  );
  const configuredChannelIds = new Set(
    cadenceForPlanning.map((target) => target.channelId),
  );
  const unconfiguredChannels = planningChannels
    .filter((channel) => !configuredChannelIds.has(channel.id))
    .map((channel) => ({
      channelId: channel.id,
      platform: channel.platform,
      handle: channel.handle,
    }));

  // Every scheduled owned post counts against the rhythm, including
  // platform-first drafts and cadence slots that have since been claimed.
  const existingByKey = new Map<string, number>();
  for (const post of existingSlots) {
    const key = `${post.platform}|${post.archetype ?? ""}`;
    existingByKey.set(key, (existingByKey.get(key) ?? 0) + 1);
  }

  // Pillar weights per channel: override rows if the channel has any, else the
  // brand default (channelId null).
  const brandMix = mix.filter((m) => m.channelId === null);
  const mixForChannel = (channelId: string) => {
    const override = mix.filter((m) => m.channelId === channelId);
    return override.length ? override : brandMix;
  };

  const rows: SlotGenRow[] = [];
  let createdTotal = 0;

  // Group baseline targets per channel so pillar allocation spans the
  // channel's whole month (all archetypes), not each archetype separately.
  // Series-scoped targets are planned separately below: they inherit the
  // series' pillar instead of a brand-mix allocation.
  const byChannel = new Map<string, typeof cadenceForPlanning>();
  for (const t of cadenceForPlanning) {
    if (t.seriesId) continue;
    if (NOT_SLOT_PLANNED.has(`${t.platform}|${t.archetype}`)) continue;
    const list = byChannel.get(t.channelId) ?? [];
    list.push(t);
    byChannel.set(t.channelId, list);
  }
  const seriesTargets = cadenceForPlanning.filter(
    (t) =>
      t.seriesId !== null &&
      !NOT_SLOT_PLANNED.has(`${t.platform}|${t.archetype}`),
  );

  const channelById = new Map(
    planningChannels.map((channel) => [channel.id, channel]),
  );
  const unconfiguredMixChannels = [...byChannel.keys()]
    .filter((channelId) => mixForChannel(channelId).length === 0)
    .flatMap((channelId) => {
      const channel = channelById.get(channelId);
      return channel
        ? [
            {
              channelId: channel.id,
              platform: channel.platform,
              handle: channel.handle,
            },
          ]
        : [];
    });
  if (!dryRun && unconfiguredMixChannels.length > 0) {
    throw new Error(
      `Set a brand or channel content mix before generating ${unconfiguredMixChannels.map((channel) => channel.platform).join(", ")} slots.`,
    );
  }

  // The resolved per-channel mix, for the preview UI ("what strategy is this
  // channel's allocation running on?").
  const mixSummary: SlotGenMix[] = [...byChannel.entries()].map(
    ([channelId, targets]) => {
      const weights = mixForChannel(channelId);
      const totalPct = weights.reduce((n, w) => n + w.targetPct, 0) || 1;
      return {
        platform: targets[0]!.platform,
        isOverride: weights.some((w) => w.channelId === channelId),
        pillars: weights
          .map((w) => ({
            pillar: w.pillar,
            pct: Math.round((w.targetPct / totalPct) * 100),
          }))
          .sort((a, b) => b.pct - a.pct),
      };
    },
  );

  for (const [channelId, targets] of byChannel) {
    // Build the channel's slot skeleton: evenly spaced days per archetype,
    // offset per archetype so formats interleave instead of stacking.
    type Pending = {
      platform: string;
      archetype: string;
      dayOffset: number;
    };
    const pending: Pending[] = [];

    targets.forEach((t, archIdx) => {
      const key = `${t.platform}|${t.archetype}`;
      const target = rangeTotal(t.count, t.period, days, fullMonth);
      const existing = existingByKey.get(key) ?? 0;
      const need = Math.max(0, target - existing);
      rows.push({
        platform: t.platform,
        archetype: t.archetype,
        count: t.count,
        period: t.period,
        target,
        existing,
        created: need,
      });
      createdTotal += need;
      for (let i = 0; i < need; i++) {
        const dayOffset = Math.min(
          days - 1,
          Math.max(0, Math.round(((i + 0.5) * days) / need) - 1 + archIdx),
        );
        pending.push({
          platform: t.platform,
          archetype: t.archetype,
          dayOffset,
        });
      }
    });
    if (!pending.length) continue;
    pending.sort((a, b) => a.dayOffset - b.dayOffset);

    // Largest-remainder pillar allocation over the channel's new slots, then
    // hand out by "most remaining first" so the mix spreads across the month.
    const weights = mixForChannel(channelId);
    if (weights.length === 0) continue;
    const totalPct = weights.reduce((n, w) => n + w.targetPct, 0) || 1;
    const alloc = new Map<string, number>();
    let allocated = 0;
    for (const w of weights) {
      const n = Math.floor((w.targetPct / totalPct) * pending.length);
      alloc.set(w.pillar, n);
      allocated += n;
    }
    const byRemainder = [...weights].sort(
      (a, b) =>
        (((b.targetPct / totalPct) * pending.length) % 1) -
        (((a.targetPct / totalPct) * pending.length) % 1),
    );
    for (let i = 0; allocated < pending.length; i++, allocated++) {
      const p = byRemainder[i % byRemainder.length]!.pillar;
      alloc.set(p, (alloc.get(p) ?? 0) + 1);
    }

    for (const slot of pending) {
      const pillar = [...alloc.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (pillar) alloc.set(pillar, (alloc.get(pillar) ?? 1) - 1);

      const format = platformFormatsFor(slot.platform as ChannelPlatform).find(
        (f) => f.archetype === slot.archetype,
      );
      const pillarName = pillar
        ? (PILLAR_BY_SLUG[pillar]?.name ?? pillar)
        : null;
      const title = [pillarName, format?.label ?? slot.archetype]
        .filter(Boolean)
        .join(" ");

      if (dryRun) continue;

      const [idea] = await db
        .insert(contentPostTable)
        .values({
          brandId,
          title,
          pillar: pillar ?? undefined,
          status: "slot",
          slotKind: "cadence",
          origin: "ai",
          plannedAt: atNoon(rangeStart, slot.dayOffset),
          targetSpots: format
            ? [
                {
                  platform: slot.platform,
                  format: format.id,
                  archetype: slot.archetype,
                },
              ]
            : undefined,
        })
        .returning({ id: contentPostTable.id });
      if (idea) {
        await db.insert(platformPostTable).values({
          brandId,
          contentPostId: idea.id,
          platform: slot.platform as ChannelPlatform,
          format: format?.id,
          archetype: slot.archetype,
          source: "owned",
          status: "slot",
          origin: "ai",
          scheduledAt: atNoon(rangeStart, slot.dayOffset),
        });
      }
    }
  }

  // ---- Series-scoped targets: one lane per (series, channel, archetype). --
  // Existing installments of the series count against its own rhythm (they
  // also count against the channel baseline above — a series post still
  // occupies its place in the channel's month).
  if (seriesTargets.length > 0) {
    const seriesRows = await db.query.seriesTable.findMany({
      where: inArray(seriesTable.id, [
        ...new Set(seriesTargets.map((t) => t.seriesId!)),
      ]),
      columns: { id: true, name: true, pillar: true },
    });
    const seriesById = new Map(seriesRows.map((row) => [row.id, row]));

    const slotPostIds = [
      ...new Set(
        existingSlots
          .map((post) => post.contentPostId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const seriesByPostId = new Map<string, string>();
    if (slotPostIds.length > 0) {
      const posts = await db.query.contentPostTable.findMany({
        where: inArray(contentPostTable.id, slotPostIds),
        columns: { id: true, seriesId: true },
      });
      for (const post of posts) {
        if (post.seriesId) seriesByPostId.set(post.id, post.seriesId);
      }
    }
    const existingBySeriesKey = new Map<string, number>();
    for (const post of existingSlots) {
      const seriesId = post.contentPostId
        ? seriesByPostId.get(post.contentPostId)
        : undefined;
      if (!seriesId) continue;
      const key = `${seriesId}|${post.platform}|${post.archetype ?? ""}`;
      existingBySeriesKey.set(key, (existingBySeriesKey.get(key) ?? 0) + 1);
    }

    for (const t of seriesTargets) {
      if (!activeChannelIds.has(t.channelId)) continue;
      const series = seriesById.get(t.seriesId!);
      if (!series) continue;
      const target = rangeTotal(t.count, t.period, days, fullMonth);
      const existing =
        existingBySeriesKey.get(
          `${series.id}|${t.platform}|${t.archetype}`,
        ) ?? 0;
      const need = Math.max(0, target - existing);
      rows.push({
        platform: t.platform,
        archetype: t.archetype,
        count: t.count,
        period: t.period,
        target,
        existing,
        created: need,
        series: series.name,
      });
      createdTotal += need;
      if (dryRun || need === 0) continue;

      const format = platformFormatsFor(t.platform).find(
        (f) => f.archetype === t.archetype,
      );
      for (let i = 0; i < need; i++) {
        const dayOffset = Math.min(
          days - 1,
          Math.max(0, Math.round(((i + 0.5) * days) / need) - 1),
        );
        const [idea] = await db
          .insert(contentPostTable)
          .values({
            brandId,
            title: `${series.name}: ${format?.label ?? t.archetype}`,
            pillar: series.pillar ?? undefined,
            seriesId: series.id,
            status: "slot",
            slotKind: "cadence",
            origin: "ai",
            plannedAt: atNoon(rangeStart, dayOffset),
            targetSpots: format
              ? [
                  {
                    platform: t.platform,
                    format: format.id,
                    archetype: t.archetype,
                  },
                ]
              : undefined,
          })
          .returning({ id: contentPostTable.id });
        if (idea) {
          await db.insert(platformPostTable).values({
            brandId,
            contentPostId: idea.id,
            platform: t.platform,
            format: format?.id,
            archetype: t.archetype,
            source: "owned",
            status: "slot",
            origin: "ai",
            scheduledAt: atNoon(rangeStart, dayOffset),
          });
        }
      }
    }
  }

  return {
    rows,
    created: createdTotal,
    mix: mixSummary,
    unconfiguredChannels,
    unconfiguredMixChannels,
  };
}
