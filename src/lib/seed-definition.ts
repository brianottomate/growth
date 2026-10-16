import { z } from "zod";

const words = z.array(z.string().trim().min(1).max(160)).max(40).default([]);
export const seedPropertyFilterSchema = z.object({
  states: words.describe(
    "Travel destination states, not the guest's home state.",
  ),
  cities: words,
  landscapes: z
    .array(z.enum(["lake", "forest", "mountain", "desert", "nationalparks"]))
    .max(5)
    .default([]),
  terms: words.describe(
    "Literal case-insensitive matches against property name, description and activities. Any term matches.",
  ),
  minBedrooms: z.number().int().min(0).max(30).nullable().default(null),
  minOccupancy: z.number().int().min(1).max(100).nullable().default(null),
  petsAllowed: z.boolean().nullable().default(null),
  near: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      radiiKm: z
        .array(z.number().positive().max(20000))
        .min(1)
        .max(8)
        .refine(
          (v) => v.every((n, i) => i === 0 || n > v[i - 1]!),
          "Radii must increase",
        ),
    })
    .nullable()
    .default(null),
});
export const seedSearchSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,59}$/),
  why: z.string().trim().min(1).max(1500),
  exclude: z.boolean().default(false),
  filter: seedPropertyFilterSchema,
});
export const seedDefinitionSchema = z
  .object({
    version: z.literal(1).default(1),
    uploadedListIds: z.array(z.string().min(1)).max(20).default([]),
    clientBookers: z.boolean().default(false),
    wander: z.boolean().default(false),
    wanderSignals: z
      .array(z.enum(["bookers", "intent"]))
      .min(1)
      .max(2)
      .default(["bookers", "intent"])
      .describe(
        "Select bookers, property intent, or their union independently of the evidence score.",
      ),
    countries: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .min(1)
      .max(50)
      .default(["US"])
      .describe(
        "Wander profile countries only; uploaded lists and client guests keep their source country coverage.",
      ),
    bookingDays: z.number().int().min(1).max(3650).default(730),
    intentDays: z.number().int().min(1).max(730).default(180),
    minScore: z.number().int().min(1).max(100).default(45),
    targetCount: z
      .number()
      .int()
      .positive()
      .max(1000000)
      .nullable()
      .default(null)
      .describe(
        "Optional expansion goal, never a minimum, cap or padding rule.",
      ),
    searches: z.array(seedSearchSchema).max(12).default([]),
    excludedHashes: z
      .array(z.string().regex(/^[a-f0-9]{64}$/))
      .max(10000)
      .default([]),
  })
  .superRefine((v, ctx) => {
    if (!v.wander && !v.clientBookers && !v.uploadedListIds.length)
      ctx.addIssue({ code: "custom", message: "Choose at least one source" });
    if (v.wander && !v.searches.some((s) => !s.exclude))
      ctx.addIssue({
        code: "custom",
        message: "Wander sources require an inclusion search",
      });
    if (new Set(v.searches.map((s) => s.key)).size !== v.searches.length)
      ctx.addIssue({ code: "custom", message: "Search keys must be unique" });
  });
export type SeedDefinition = z.infer<typeof seedDefinitionSchema>;
export type SeedSearch = z.infer<typeof seedSearchSchema>;
export type SeedEvidence = {
  source: string;
  search: string | null;
  score: number;
  ring: number;
  bookings: number;
  views: number;
  dates: number;
  checkouts: number;
};
export type SeedCandidate = { emailHash: string; evidence: SeedEvidence[] };

/** Transparent evidence tiers; scores are ordinal heuristics, not conversion probabilities. */
export function seedEvidenceScore(signal: {
  bookings: number;
  views: number;
  dates: number;
  checkouts: number;
}) {
  if (signal.bookings > 0) return 100;
  if (signal.checkouts > 0) return 80;
  if (signal.dates > 0) return 65;
  if (signal.views >= 2) return 45;
  return signal.views > 0 ? 25 : 0;
}

export function selectSeedCandidates(
  input: SeedCandidate[],
  definition: SeedDefinition,
) {
  const excluded = new Set(definition.excludedHashes);
  const negative = new Set(
    definition.searches.filter((s) => s.exclude).map((s) => s.key),
  );
  const byHash = new Map<string, SeedEvidence[]>();
  for (const row of input) {
    if (!/^[a-f0-9]{64}$/.test(row.emailHash))
      throw new Error("Invalid seed identity");
    byHash.set(row.emailHash, [
      ...(byHash.get(row.emailHash) ?? []),
      ...row.evidence,
    ]);
  }
  const eligible = [...byHash].filter(
    ([h, e]) =>
      !excluded.has(h) && !e.some((v) => v.search && negative.has(v.search)),
  );
  const maximumRing = Math.max(
    0,
    ...definition.searches
      .filter((s) => !s.exclude)
      .map((s) => (s.filter.near?.radiiKm.length ?? 1) - 1),
  );
  const expansion = [];
  let members: {
    emailHash: string;
    score: number;
    evidence: SeedEvidence[];
  }[] = [];
  for (let ring = 0; ring <= maximumRing; ring++) {
    members = eligible.flatMap(([emailHash, evidence]) => {
      const grouped = new Map<string, SeedEvidence>();
      for (const e of evidence.filter((e) => e.ring <= ring)) {
        const key = JSON.stringify([e.source, e.search]);
        const previous = grouped.get(key);
        grouped.set(
          key,
          previous
            ? {
                ...e,
                bookings: previous.bookings + e.bookings,
                views: previous.views + e.views,
                dates: previous.dates + e.dates,
                checkouts: previous.checkouts + e.checkouts,
                score: Math.max(previous.score, e.score),
              }
            : { ...e },
        );
      }
      const active = [...grouped.values()]
        .map((e) => ({ ...e, score: Math.max(e.score, seedEvidenceScore(e)) }))
        .filter((e) => e.score >= definition.minScore);
      return active.length
        ? [
            {
              emailHash,
              score: Math.max(...active.map((e) => e.score)),
              evidence: active,
            },
          ]
        : [];
    });
    expansion.push({ ring, count: members.length });
    // With no size request, preserve all relevance-qualified members within the declared bounds.
    if (
      definition.targetCount !== null &&
      members.length >= definition.targetCount
    )
      break;
  }
  members.sort(
    (a, b) => b.score - a.score || a.emailHash.localeCompare(b.emailHash),
  );
  return {
    members,
    expansion,
    goalMet:
      definition.targetCount === null
        ? null
        : members.length >= definition.targetCount,
    candidateCount: byHash.size,
    excludedCount: byHash.size - eligible.length,
  };
}

export type SeedQueryParams = Record<
  string,
  string | number | boolean | string[] | number[]
>;

/** Count people once per evidence key, including keys that shadow Object members. */
export function seedEvidenceCounts(members: Pick<SeedCandidate, "evidence">[]) {
  const counts = new Map<string, number>();
  for (const member of members)
    for (const key of new Set(member.evidence.map((e) => e.search ?? e.source)))
      counts.set(key, (counts.get(key) ?? 0) + 1);
  return Object.fromEntries(counts);
}
