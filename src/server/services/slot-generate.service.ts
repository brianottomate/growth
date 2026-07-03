import { and, eq, gte, isNull, lt } from "drizzle-orm";

import { db } from "@/server/db";
import {
  cadenceTargetTable,
  contentPostTable,
  mixTargetTable,
  platformPostTable,
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

const daysIn = (year: number, month1: number) => new Date(year, month1, 0).getDate();
const noon = (year: number, month1: number, day: number) =>
  new Date(year, month1 - 1, day, 12);

/** Slots a period target implies for the given month. */
function monthTotal(count: number, period: string, days: number): number {
  if (period === "day") return count * days;
  if (period === "week") return Math.round((count * days) / 7);
  return count; // month
}

export type SlotGenRow = {
  platform: string;
  archetype: string;
  target: number;
  existing: number;
  created: number;
};

/** The resolved pillar mix a channel's slots are allocated from (its
 *  mix_target override, else the brand default), as display percentages. */
export type SlotGenMix = {
  platform: string;
  isOverride: boolean;
  pillars: { pillar: string; pct: number }[];
};

export async function generateMonthSlots(opts: {
  brandId: string;
  year: number;
  month: number; // 1-12
  dryRun?: boolean;
}): Promise<{ rows: SlotGenRow[]; created: number; mix: SlotGenMix[] }> {
  const { brandId, year, month, dryRun } = opts;
  const days = daysIn(year, month);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  const [cadence, mix, existingSlots] = await Promise.all([
    db.query.cadenceTargetTable.findMany({
      where: and(
        eq(cadenceTargetTable.brandId, brandId),
        eq(cadenceTargetTable.isActive, true),
        isNull(cadenceTargetTable.deletedAt),
      ),
    }),
    db.query.mixTargetTable.findMany({
      where: and(eq(mixTargetTable.brandId, brandId), eq(mixTargetTable.isActive, true)),
    }),
    db.query.contentPostTable.findMany({
      where: and(
        eq(contentPostTable.brandId, brandId),
        eq(contentPostTable.slotKind, "cadence"),
        isNull(contentPostTable.deletedAt),
        gte(contentPostTable.plannedAt, monthStart),
        lt(contentPostTable.plannedAt, monthEnd),
      ),
      with: { platformPosts: { columns: { platform: true, archetype: true } } },
    }),
  ]);

  // Existing cadence slots per platform|archetype (claimed ones still count).
  const existingByKey = new Map<string, number>();
  for (const s of existingSlots) {
    for (const p of s.platformPosts) {
      const key = `${p.platform}|${p.archetype ?? ""}`;
      existingByKey.set(key, (existingByKey.get(key) ?? 0) + 1);
    }
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

  // Group targets per channel so pillar allocation spans the channel's whole
  // month (all archetypes), not each archetype separately.
  const byChannel = new Map<string, typeof cadence>();
  for (const t of cadence) {
    if (NOT_SLOT_PLANNED.has(`${t.platform}|${t.archetype}`)) continue;
    const list = byChannel.get(t.channelId) ?? [];
    list.push(t);
    byChannel.set(t.channelId, list);
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
    type Pending = { platform: string; archetype: string; day: number };
    const pending: Pending[] = [];

    targets.forEach((t, archIdx) => {
      const key = `${t.platform}|${t.archetype}`;
      const target = monthTotal(t.count, t.period, days);
      const existing = existingByKey.get(key) ?? 0;
      const need = Math.max(0, target - existing);
      rows.push({ platform: t.platform, archetype: t.archetype, target, existing, created: need });
      for (let i = 0; i < need; i++) {
        const day = Math.min(
          days,
          Math.max(1, Math.round(((i + 0.5) * days) / need) + archIdx),
        );
        pending.push({ platform: t.platform, archetype: t.archetype, day });
      }
    });
    if (!pending.length) continue;
    pending.sort((a, b) => a.day - b.day);

    // Largest-remainder pillar allocation over the channel's new slots, then
    // hand out by "most remaining first" so the mix spreads across the month.
    const weights = mixForChannel(channelId);
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
        ((b.targetPct / totalPct) * pending.length) % 1 -
        ((a.targetPct / totalPct) * pending.length) % 1,
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
      const pillarName = pillar ? (PILLAR_BY_SLUG[pillar]?.name ?? pillar) : null;
      const title = [pillarName, format?.label ?? slot.archetype]
        .filter(Boolean)
        .join(" ");

      createdTotal++;
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
          plannedAt: noon(year, month, slot.day),
          targetSpots: format
            ? [{ platform: slot.platform, format: format.id, archetype: slot.archetype }]
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
          scheduledAt: noon(year, month, slot.day),
        });
      }
    }
  }

  return { rows, created: createdTotal, mix: mixSummary };
}
