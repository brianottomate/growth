import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import { and, eq, gte, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { formatCountsTowardCadence } from "@/server/content/formats";
import {
  brandInspirationTable,
  brandTable,
  cadenceTargetTable,
  channelTable,
  mixTargetTable,
  platformPostTable,
} from "@/server/db/schema";
import { PILLARS } from "@/lib/pillars";

/**
 * Target suggestions — the "should we change our cadence/mix?" engine.
 *
 * Deterministic evidence gathering (own Zernio-synced performance per
 * platform × archetype, peer cadences from scraped posts, current targets),
 * then ONE AI call that proposes target diffs with rationale. Persists
 * NOTHING — proposals are blueprint-style ephemeral; the review UI applies
 * accepted rows through the existing setCadenceTarget/setMixTarget paths.
 *
 * Period discipline: proposals for an EXISTING target keep its period
 * (setCadenceTarget upserts by (channel, archetype, template, period) — a
 * period change would strand the old row). New-format proposals default to
 * weekly.
 */

const MODEL = "claude-sonnet-5";
const WINDOW_DAYS = 60;

export type TargetSuggestion = {
  kind: "cadence" | "mix";
  platform: string | null; // cadence only
  channelId: string | null; // cadence only — resolved server-side, never by AI
  archetype: string | null; // cadence only
  period: string | null; // cadence only
  pillar: string | null; // mix only (brand default)
  current: number | null; // count (cadence) or pct (mix); null = new target
  proposed: number;
  basis: "peer_benchmark" | "own_performance" | "both";
  rationale: string;
  confidence: number;
};

export type SuggestTargetsResult = {
  suggestions: TargetSuggestion[];
  evidence: {
    windowDays: number;
    ownPosts: number;
    peerPosts: number;
    peerBrands: number;
    peerDataAgeDays: number | null; // days since newest peer post — staleness signal
  };
};

export async function suggestTargets(
  brandId: string,
): Promise<SuggestTargetsResult> {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const weeks = WINDOW_DAYS / 7;

  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
    columns: { id: true, name: true, slug: true },
  });
  if (!brand) throw new Error("brand not found");

  const [channels, cadence, mix, tracked] = await Promise.all([
    db.query.channelTable.findMany({
      where: and(
        eq(channelTable.brandId, brandId),
        isNull(channelTable.deletedAt),
      ),
      columns: { id: true, platform: true, kind: true },
    }),
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
        isNull(mixTargetTable.channelId),
      ),
    }),
    db.query.brandInspirationTable.findMany({
      where: eq(brandInspirationTable.brandId, brandId),
      with: { inspirationBrand: { columns: { id: true, name: true } } },
    }),
  ]);

  const peerBrandIds = tracked
    .map((t) => t.inspirationBrand?.id)
    .filter((id): id is string => !!id);
  const peerNames = new Map(
    tracked
      .filter((t) => t.inspirationBrand)
      .map((t) => [t.inspirationBrand.id, t.inspirationBrand.name]),
  );

  const posts = await db.query.platformPostTable.findMany({
    where: and(
      inArray(platformPostTable.brandId, [brandId, ...peerBrandIds]),
      gte(platformPostTable.publishedAt, cutoff),
    ),
    columns: {
      brandId: true,
      platform: true,
      format: true,
      archetype: true,
      stats: true,
      publishedAt: true,
    },
  });
  const own = posts.filter(
    (p) => p.brandId === brandId && formatCountsTowardCadence(p.format),
  );
  const peers = posts.filter(
    (p) => p.brandId !== brandId && formatCountsTowardCadence(p.format),
  );

  // ---- own performance per platform × archetype ----
  type Perf = { n: number; views: number[]; likes: number[] };
  const ownPerf = new Map<string, Perf>();
  for (const p of own) {
    const key = `${p.platform}|${p.archetype ?? "other"}`;
    const e = ownPerf.get(key) ?? { n: 0, views: [], likes: [] };
    e.n++;
    if (p.stats?.views != null) e.views.push(p.stats.views);
    if (p.stats?.likes != null) e.likes.push(p.stats.likes);
    ownPerf.set(key, e);
  }
  const avg = (xs: number[]) =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;

  // ---- peer cadence per platform × archetype (avg per active peer brand) ----
  const peerByKey = new Map<string, Map<string, number>>(); // key -> brandId -> n
  for (const p of peers) {
    const key = `${p.platform}|${p.archetype ?? "other"}`;
    const perBrand = peerByKey.get(key) ?? new Map<string, number>();
    perBrand.set(p.brandId, (perBrand.get(p.brandId) ?? 0) + 1);
    peerByKey.set(key, perBrand);
  }
  const newestPeer = peers.reduce<Date | null>(
    (max, p) =>
      p.publishedAt && (!max || p.publishedAt > max) ? p.publishedAt : max,
    null,
  );

  // ---- digests for the model ----
  const targetLines = cadence.map(
    (t) =>
      `${t.platform}/${t.archetype}: target ${t.count}/${t.period}` +
      (t.notes ? ` (${t.notes.slice(0, 80)})` : ""),
  );
  const mixLines = mix.map((m) => `${m.pillar}: ${m.targetPct}%`);
  const ownLines = [...ownPerf.entries()].map(([key, e]) => {
    const [platform, archetype] = key.split("|");
    return `${platform}/${archetype}: observed ${(e.n / weeks).toFixed(1)}/wk over ${WINDOW_DAYS}d · avg ${avg(e.views) ?? "?"} views · avg ${avg(e.likes) ?? "?"} likes (n=${e.n})`;
  });
  const peerLines = [...peerByKey.entries()].map(([key, perBrand]) => {
    const [platform, archetype] = key.split("|");
    const brandsHere = [...perBrand.entries()]
      .map(
        ([id, n]) => `${peerNames.get(id) ?? "?"} ${(n / weeks).toFixed(1)}/wk`,
      )
      .join(", ");
    return `${platform}/${archetype}: ${brandsHere}`;
  });

  const pillarSlugs = PILLARS.filter(
    (p) => p.brandSlug === (brand.slug ?? ""),
  ).map((p) => p.slug);
  if (!pillarSlugs.length) pillarSlugs.push(...PILLARS.map((p) => p.slug));
  const platforms = [
    ...new Set(
      channels.filter((c) => c.kind === "social").map((c) => c.platform),
    ),
  ];

  const suggestionSchema = z.object({
    suggestions: z
      .array(
        z.object({
          kind: z.enum(["cadence", "mix"]),
          platform: z
            .enum(
              (platforms.length ? platforms : ["instagram"]) as [
                string,
                ...string[],
              ],
            )
            .nullable()
            .describe("Required for cadence suggestions; null for mix."),
          archetype: z
            .string()
            .nullable()
            .describe(
              "Required for cadence: image|carousel|video_short|video_long|text|story|thread|article.",
            ),
          pillar: z
            .enum(pillarSlugs as [string, ...string[]])
            .nullable()
            .describe("Required for mix suggestions; null for cadence."),
          proposed: z
            .number()
            .int()
            .min(0)
            .describe(
              "Cadence: the new COUNT (the existing target's period is kept). Mix: the new percent.",
            ),
          basis: z
            .enum(["peer_benchmark", "own_performance", "both"])
            .describe("Which evidence drives this proposal."),
          rationale: z
            .string()
            .describe(
              "One or two sentences citing the evidence: own performance, peer cadence, or both.",
            ),
          confidence: z.number().min(0).max(1),
        }),
      )
      .max(10)
      .describe(
        "Only propose CHANGES — skip targets the evidence supports as-is.",
      ),
  });

  const peerAge = newestPeer
    ? Math.round((Date.now() - newestPeer.getTime()) / 86_400_000)
    : null;

  const system = [
    `You are the content strategist for ${brand.name}, reviewing publishing cadence and pillar-mix targets against evidence.`,
    "SIGNAL HIERARCHY — use the right evidence for the right axis:\n" +
      "- VOLUME (cadence counts): the PEER BENCHMARK is primary. What do category leaders like Airbnb and Rimowa actually publish per week on each platform/format? Targets exist to be competitive, not to mirror our own past output.\n" +
      "- FORMAT & MIX allocation: OWN engagement performance is primary (double down on formats/pillars that outperform for us, trim ones that are dead for reach).",
    "CRITICAL: under-execution is NOT evidence for lowering a target. If we target 4/wk and shipped 1.2/wk but the format performs fine, that is an execution gap — keep the ambition and say so in the rationale (or skip the suggestion). Only propose lowering volume when the format ALSO underperforms on engagement or peers genuinely publish less.",
    "Propose target CHANGES only where evidence argues for one. Conservative steps: one notch at a time, not 5x jumps.",
    "Cadence proposals: the new count for an existing platform/archetype target (its period stays). Mix proposals: new percent for a brand-default pillar (aim for the full set still summing near 100 — prefer paired adjustments).",
    peerAge != null && peerAge > 14
      ? `CAUTION: peer data is ~${peerAge} days stale — say so when citing it and lower confidence on peer-based claims.`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const prompt = [
    "CURRENT CADENCE TARGETS:",
    ...targetLines,
    "",
    "CURRENT BRAND-DEFAULT MIX:",
    ...mixLines,
    "",
    `OWN OBSERVED (last ${WINDOW_DAYS}d, Zernio-synced stats):`,
    ...(ownLines.length ? ownLines : ["(no posts in window)"]),
    "",
    `PEER OBSERVED (tracked brands, last ${WINDOW_DAYS}d):`,
    ...(peerLines.length ? peerLines : ["(no peer posts in window)"]),
    "",
    "Propose the target updates now.",
  ].join("\n");

  const { output } = await generateText({
    model: anthropic(MODEL),
    output: Output.object({ schema: suggestionSchema }),
    system,
    prompt,
    temperature: 0.3,
  });

  // ---- deterministic resolution: channel ids, current values, drop no-ops ----
  const channelByPlatform = new Map(
    channels.filter((c) => c.kind === "social").map((c) => [c.platform, c.id]),
  );
  const cadenceByKey = new Map(
    cadence.map((t) => [`${t.platform}|${t.archetype}`, t]),
  );
  const mixByPillar = new Map(mix.map((m) => [m.pillar, m.targetPct]));

  const suggestions: TargetSuggestion[] = [];
  for (const s of output.suggestions) {
    if (s.kind === "cadence") {
      if (!s.platform || !s.archetype) continue;
      const channelId = channelByPlatform.get(s.platform as never);
      if (!channelId) continue;
      const existing = cadenceByKey.get(`${s.platform}|${s.archetype}`);
      const current = existing?.count ?? null;
      if (current === s.proposed) continue;
      suggestions.push({
        kind: "cadence",
        platform: s.platform,
        channelId,
        archetype: s.archetype,
        period: existing?.period ?? "week",
        pillar: null,
        current,
        proposed: s.proposed,
        basis: s.basis,
        rationale: s.rationale,
        confidence: s.confidence,
      });
    } else {
      if (!s.pillar) continue;
      const current = mixByPillar.get(s.pillar) ?? null;
      if (current === s.proposed) continue;
      suggestions.push({
        kind: "mix",
        platform: null,
        channelId: null,
        archetype: null,
        period: null,
        pillar: s.pillar,
        current,
        proposed: s.proposed,
        basis: s.basis,
        rationale: s.rationale,
        confidence: s.confidence,
      });
    }
  }

  return {
    suggestions,
    evidence: {
      windowDays: WINDOW_DAYS,
      ownPosts: own.length,
      peerPosts: peers.length,
      peerBrands: new Set(peers.map((p) => p.brandId)).size,
      peerDataAgeDays: peerAge,
    },
  };
}
