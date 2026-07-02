import "server-only";

import { and, eq, gte, isNull, lt, ne } from "drizzle-orm";

import { db } from "@/server/db";
import { contentPostTable } from "@/server/db/schema";
import type {
  PlanImportIdea,
  SlotMatch,
} from "@/server/db/plan-import-schema";

/**
 * Idea ↔ slot matching — deterministic, no AI. Scores every candidate
 * (idea-platform, open-slot) pairing and assigns GLOBALLY greedy so an early
 * idea can't steal a later idea's same-day slot. Pillar/archetype are soft
 * evidence (apply overwrites both with the sheet's truth); the date is the
 * dominant signal.
 */

export type OpenSlot = {
  contentPostId: string;
  platformPostId: string;
  platform: string;
  archetype: string | null;
  pillar: string | null;
  date: string; // YYYY-MM-DD from plannedAt (local)
};

export type MatchResult = {
  kind: "fill_slots" | "new_idea";
  matches: SlotMatch[];
  unmatchedPlatforms: string[];
  confidence: number; // 0..1
  reasoning: string;
};

const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(y!, m! - 1, 1), end: new Date(y!, m!, 1) };
}

/** Open cadence slots for the month — the matching target. Same query shape
 *  as slot-generate's idempotency read, narrowed to still-unclaimed shells. */
export async function loadOpenSlots(
  brandId: string,
  month: string,
): Promise<OpenSlot[]> {
  const { start, end } = monthRange(month);
  const slots = await db.query.contentPostTable.findMany({
    where: and(
      eq(contentPostTable.brandId, brandId),
      eq(contentPostTable.status, "slot"),
      eq(contentPostTable.slotKind, "cadence"),
      isNull(contentPostTable.deletedAt),
      gte(contentPostTable.plannedAt, start),
      lt(contentPostTable.plannedAt, end),
    ),
    with: {
      platformPosts: {
        columns: { id: true, platform: true, archetype: true, status: true },
      },
    },
  });
  const out: OpenSlot[] = [];
  for (const s of slots) {
    const spot = s.platformPosts[0];
    if (!spot || !s.plannedAt) continue;
    out.push({
      contentPostId: s.id,
      platformPostId: spot.id,
      platform: spot.platform,
      archetype: spot.archetype,
      pillar: s.pillar,
      date: localDateStr(s.plannedAt),
    });
  }
  return out;
}

const DAY_MS = 86_400_000;
const dayDelta = (a: string, b: string) =>
  Math.round((new Date(a).getTime() - new Date(b).getTime()) / DAY_MS);

const MAX_DAY_DISTANCE = 7;
const CANDIDATE_FLOOR = 0.35;
const PAIR_THRESHOLD = 0.5;

function score(
  ideaDate: string,
  ideaPillar: string | null,
  ideaArchetype: string,
  slot: OpenSlot,
): number {
  const dd = Math.abs(dayDelta(ideaDate, slot.date));
  if (dd > MAX_DAY_DISTANCE) return 0;
  const dateScore = Math.max(0, 1 - dd / MAX_DAY_DISTANCE);
  const pillarScore =
    ideaPillar && slot.pillar
      ? ideaPillar === slot.pillar
        ? 1
        : 0.15
      : 0.5;
  const archetypeScore =
    slot.archetype && ideaArchetype === slot.archetype ? 1 : 0.3;
  return 0.6 * dateScore + 0.25 * pillarScore + 0.15 * archetypeScore;
}

// Primary-slot tie-break preference when |dayDelta| ties.
const PLATFORM_PRIORITY = ["instagram", "tiktok"];

export function matchIdeasToSlots(
  ideas: PlanImportIdea[],
  slots: OpenSlot[],
): MatchResult[] {
  type Candidate = {
    ideaIdx: number;
    platform: string;
    slot: OpenSlot;
    s: number;
    dd: number;
  };
  const candidates: Candidate[] = [];

  ideas.forEach((idea, ideaIdx) => {
    for (const spot of idea.spots) {
      const effectiveDate = spot.date ?? idea.date;
      if (!effectiveDate) continue;
      for (const slot of slots) {
        if (slot.platform !== spot.platform) continue;
        const s = score(effectiveDate, idea.pillar, spot.archetype, slot);
        if (s < CANDIDATE_FLOOR) continue;
        candidates.push({
          ideaIdx,
          platform: spot.platform,
          slot,
          s,
          dd: dayDelta(effectiveDate, slot.date),
        });
      }
    }
  });

  // Global greedy: best score first; each slot consumed once; each
  // (idea, platform) filled once.
  candidates.sort((a, b) => b.s - a.s || Math.abs(a.dd) - Math.abs(b.dd));
  const usedSlots = new Set<string>();
  const filled = new Set<string>(); // `${ideaIdx}|${platform}`
  const byIdea = new Map<number, Candidate[]>();
  for (const c of candidates) {
    if (c.s < PAIR_THRESHOLD) break; // sorted — everything after is weaker
    const key = `${c.ideaIdx}|${c.platform}`;
    if (usedSlots.has(c.slot.contentPostId) || filled.has(key)) continue;
    usedSlots.add(c.slot.contentPostId);
    filled.add(key);
    (byIdea.get(c.ideaIdx) ?? byIdea.set(c.ideaIdx, []).get(c.ideaIdx)!).push(c);
  }

  return ideas.map((idea, ideaIdx) => {
    const won = (byIdea.get(ideaIdx) ?? []).sort(
      (a, b) =>
        Math.abs(a.dd) - Math.abs(b.dd) ||
        indexOfPriority(a.platform) - indexOfPriority(b.platform) ||
        a.slot.date.localeCompare(b.slot.date),
    );
    const matches: SlotMatch[] = won.map((c) => ({
      platform: c.platform,
      contentPostId: c.slot.contentPostId,
      platformPostId: c.slot.platformPostId,
      slotDate: c.slot.date,
      dayDelta: c.dd,
      score: Number(c.s.toFixed(3)),
    }));
    const matchedPlatforms = new Set(matches.map((m) => m.platform));
    const unmatchedPlatforms = idea.spots
      .map((s) => s.platform)
      .filter((p) => !matchedPlatforms.has(p));

    const kind = matches.length > 0 ? ("fill_slots" as const) : ("new_idea" as const);
    const total = idea.spots.length || 1;
    const mean = matches.length
      ? matches.reduce((n, m) => n + m.score, 0) / matches.length
      : 0;
    const confidence =
      kind === "fill_slots"
        ? Number((mean * (0.7 + 0.3 * (matches.length / total))).toFixed(3))
        : idea.date
          ? 0.6 // dated but nothing open nearby — solid new-idea proposal
          : 0.4; // undated scraps (e.g. asset-only rows)

    const reasoning =
      kind === "fill_slots"
        ? matches
            .map(
              (m) =>
                `${m.platform} → slot ${m.slotDate} (${m.dayDelta >= 0 ? "+" : ""}${m.dayDelta}d, s=${m.score})`,
            )
            .join("; ") +
          (unmatchedPlatforms.length
            ? `; no slot for ${unmatchedPlatforms.join(", ")} → new spot(s)`
            : "")
        : `no open ${idea.spots.map((s) => s.platform).join("/")} slot within ${MAX_DAY_DISTANCE}d of ${idea.date ?? "an (undated) idea"} → create as new idea`;

    return { kind, matches, unmatchedPlatforms, confidence, reasoning };
  });
}

function indexOfPriority(platform: string): number {
  const i = PLATFORM_PRIORITY.indexOf(platform);
  return i === -1 ? PLATFORM_PRIORITY.length : i;
}

/** Slots still open after a set of consume decisions — the gaps report. */
export function computeGaps(
  slots: OpenSlot[],
  consumedSlotContentPostIds: Set<string>,
): OpenSlot[] {
  return slots.filter((s) => !consumedSlotContentPostIds.has(s.contentPostId));
}

/** Possible-duplicate hint: does a non-slot idea with ~the same title already
 *  exist in the month (e.g. a previous import or hand-entered plan)? */
export async function findDuplicateHints(
  ideas: PlanImportIdea[],
  brandId: string,
  month: string,
): Promise<Map<number, string>> {
  const { start, end } = monthRange(month);
  const existing = await db.query.contentPostTable.findMany({
    where: and(
      eq(contentPostTable.brandId, brandId),
      ne(contentPostTable.status, "slot"),
      isNull(contentPostTable.deletedAt),
      gte(contentPostTable.plannedAt, start),
      lt(contentPostTable.plannedAt, end),
    ),
    columns: { id: true, title: true },
  });
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N} ]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  const byTitle = new Map(
    existing.filter((e) => e.title).map((e) => [norm(e.title!), e.id]),
  );
  const hints = new Map<number, string>();
  ideas.forEach((idea, i) => {
    const hit = byTitle.get(norm(idea.title));
    if (hit) hints.set(i, hit);
  });
  return hints;
}
