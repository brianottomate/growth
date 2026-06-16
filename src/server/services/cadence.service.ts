import { and, eq, gte, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  cadenceTargetTable,
  channelTable,
  mixTargetTable,
  platformPostTable,
} from "@/server/db/schema";

/**
 * Cadence service — the shared "are we executing the strategy?" computation.
 *
 * OBSERVED cadence/mix is derived live from `platform_post` history (no
 * storage); TARGET comes from `cadence_target` / `mix_target`. The same
 * derivation runs for our own brand and for tracked competitor/peer brands
 * (their scraped posts), so a brand can be benchmarked against the field.
 *
 * This is the single source of truth for /brands/[slug], /channels, and (later)
 * /cmo, so the logic lives here instead of inline in a page.
 */

const DEFAULT_WINDOW_DAYS = 28;

/** Normalize a target count to per-week so observed and target are comparable. */
function perWeek(count: number, period: string): number {
  return period === "week" ? count : period === "day" ? count * 7 : count / 4.345;
}

/** Classify observed against target with a ±20% tolerance band. */
export type CadenceStatus = "untracked" | "under" | "on" | "over";
function classify(observed: number, target: number | null): CadenceStatus {
  if (target == null) return "untracked";
  if (target === 0) return observed > 0 ? "over" : "on";
  const ratio = observed / target;
  if (ratio < 0.8) return "under";
  if (ratio > 1.2) return "over";
  return "on";
}

export type ArchetypeCadence = {
  archetype: string;
  observedPerWeek: number;
  target: number | null; // per-week normalized
  peerPerWeek: number | null; // avg per peer brand per week (benchmark)
  status: CadenceStatus;
};

export type ChannelCadence = {
  channelId: string;
  platform: string;
  handle: string | null;
  followerCount: number | null;
  postsInWindow: number;
  observedPerWeek: number; // total across archetypes
  targetPerWeek: number | null; // sum of archetype targets (null if none set)
  status: CadenceStatus;
  archetypes: ArchetypeCadence[];
};

export type MixRow = {
  pillar: string;
  count: number;
  pct: number; // observed % of our posts in window
  targetPct: number | null;
  peerPct: number | null; // peers' observed % for the same pillar
  status: CadenceStatus;
};

export type BrandStrategy = {
  windowDays: number;
  weeks: number;
  channels: ChannelCadence[];
  mix: MixRow[];
  mixTotal: number; // our total classified posts in window
  hasTargets: boolean;
  peerBrandCount: number;
};

type PostRow = {
  brandId: string;
  platform: string;
  archetype: string | null;
  contentPost: { pillar: string | null } | null;
};

export async function getBrandStrategy(
  brandId: string,
  opts: { peerBrandIds?: string[]; windowDays?: number } = {},
): Promise<BrandStrategy> {
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const weeks = windowDays / 7;
  const peerBrandIds = opts.peerBrandIds ?? [];
  const cutoff = new Date(Date.now() - windowDays * 86_400_000);

  const allBrandIds = [brandId, ...peerBrandIds];

  const [channels, posts, cadence, mix] = await Promise.all([
    db.query.channelTable.findMany({
      where: and(
        eq(channelTable.brandId, brandId),
        isNull(channelTable.deletedAt),
      ),
      columns: {
        id: true,
        platform: true,
        handle: true,
        followerCount: true,
        kind: true,
      },
    }),
    db.query.platformPostTable.findMany({
      where: and(
        inArray(platformPostTable.brandId, allBrandIds),
        gte(platformPostTable.publishedAt, cutoff),
      ),
      columns: { brandId: true, platform: true, archetype: true },
      with: { contentPost: { columns: { pillar: true } } },
    }),
    db.query.cadenceTargetTable.findMany({
      where: and(
        eq(cadenceTargetTable.brandId, brandId),
        eq(cadenceTargetTable.isActive, true),
      ),
    }),
    db.query.mixTargetTable.findMany({
      where: and(
        eq(mixTargetTable.brandId, brandId),
        eq(mixTargetTable.isActive, true),
      ),
    }),
  ]);

  const ourPosts = (posts as PostRow[]).filter((p) => p.brandId === brandId);
  const peerPosts = (posts as PostRow[]).filter((p) => p.brandId !== brandId);

  // ---- Pillar mix (observed % vs target %, + peer benchmark) -------------
  const mixCounts = new Map<string, number>();
  for (const p of ourPosts) {
    const pillar = p.contentPost?.pillar ?? "__unsorted";
    mixCounts.set(pillar, (mixCounts.get(pillar) ?? 0) + 1);
  }
  const peerMixCounts = new Map<string, number>();
  for (const p of peerPosts) {
    const pillar = p.contentPost?.pillar ?? "__unsorted";
    peerMixCounts.set(pillar, (peerMixCounts.get(pillar) ?? 0) + 1);
  }
  const targetByPillar = new Map(mix.map((m) => [m.pillar, m.targetPct]));
  const mixTotal = ourPosts.length;
  const peerMixTotal = peerPosts.length;
  const mixRows: MixRow[] = [
    ...new Set([
      ...mixCounts.keys(),
      ...targetByPillar.keys(),
      ...peerMixCounts.keys(),
    ]),
  ]
    .map((pillar) => {
      const count = mixCounts.get(pillar) ?? 0;
      const pct = mixTotal ? Math.round((count / mixTotal) * 100) : 0;
      const targetPct = targetByPillar.get(pillar) ?? null;
      const peerPct = peerMixTotal
        ? Math.round(((peerMixCounts.get(pillar) ?? 0) / peerMixTotal) * 100)
        : null;
      return { pillar, count, pct, targetPct, peerPct, status: classify(pct, targetPct) };
    })
    .sort((a, b) => b.count - a.count);

  // ---- Per-channel cadence by archetype ----------------------------------
  // Peer benchmark: avg posts/week per peer brand that actually uses the
  // platform — so a competitor that ignores a channel doesn't deflate it.
  const peerBrandsByPlatform = new Map<string, Set<string>>();
  for (const p of peerPosts) {
    const set = peerBrandsByPlatform.get(p.platform) ?? new Set<string>();
    set.add(p.brandId);
    peerBrandsByPlatform.set(p.platform, set);
  }
  const peerCountByPlatformArch = new Map<string, number>();
  for (const p of peerPosts) {
    const key = `${p.platform}|${p.archetype ?? "other"}`;
    peerCountByPlatformArch.set(key, (peerCountByPlatformArch.get(key) ?? 0) + 1);
  }

  const channelRows: ChannelCadence[] = channels
    .filter((c) => c.kind !== "ad")
    .map((c) => {
      const cPosts = ourPosts.filter((p) => p.platform === c.platform);
      const archCounts = new Map<string, number>();
      for (const p of cPosts) {
        const a = p.archetype ?? "other";
        archCounts.set(a, (archCounts.get(a) ?? 0) + 1);
      }
      const targetByArch = new Map(
        cadence
          .filter((t) => t.channelId === c.id)
          .map((t) => [t.archetype, perWeek(t.count, t.period)]),
      );
      const peerBrandsHere = peerBrandsByPlatform.get(c.platform)?.size ?? 0;

      const archetypes: ArchetypeCadence[] = [
        ...new Set([...archCounts.keys(), ...targetByArch.keys()]),
      ]
        .map((archetype) => {
          const observedPerWeek = (archCounts.get(archetype) ?? 0) / weeks;
          const target = targetByArch.get(archetype) ?? null;
          const peerTotal =
            peerCountByPlatformArch.get(`${c.platform}|${archetype}`) ?? 0;
          const peerPerWeek =
            peerBrandsHere > 0 ? peerTotal / (peerBrandsHere * weeks) : null;
          return {
            archetype,
            observedPerWeek,
            target,
            peerPerWeek,
            status: classify(observedPerWeek, target),
          };
        })
        .sort(
          (a, b) =>
            b.observedPerWeek - a.observedPerWeek ||
            (b.target ?? 0) - (a.target ?? 0),
        );

      const observedPerWeek = cPosts.length / weeks;
      const targets = archetypes.map((a) => a.target).filter((t): t is number => t != null);
      const targetPerWeek = targets.length
        ? targets.reduce((n, t) => n + t, 0)
        : null;

      return {
        channelId: c.id,
        platform: c.platform,
        handle: c.handle,
        followerCount: c.followerCount,
        postsInWindow: cPosts.length,
        observedPerWeek,
        targetPerWeek,
        status: classify(observedPerWeek, targetPerWeek),
        archetypes,
      };
    });

  return {
    windowDays,
    weeks,
    channels: channelRows,
    mix: mixRows,
    mixTotal,
    hasTargets: cadence.length > 0 || mix.length > 0,
    peerBrandCount: new Set(peerPosts.map((p) => p.brandId)).size,
  };
}
