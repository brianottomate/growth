import { expect, test } from "bun:test";
import {
  seedDefinitionSchema,
  selectSeedCandidates,
  type SeedCandidate,
} from "./seed-definition";
const hash = (n: number) => n.toString(16).padStart(64, "0");
const definition = seedDefinitionSchema.parse({
  wander: true,
  searches: [
    {
      key: "lake",
      why: "Observed lake-trip activity",
      filter: {
        near: { latitude: 35, longitude: -92, radiiKm: [50, 150, 300] },
      },
    },
  ],
});
const member = (n: number, ring: number, views = 0): SeedCandidate => ({
  emailHash: hash(n),
  evidence: [
    {
      source: "wander_intent",
      search: "lake",
      ring,
      score: views ? 25 : 80,
      bookings: 0,
      views,
      dates: 0,
      checkouts: views ? 0 : 1,
    },
  ],
});

test("size is an expansion goal, never a floor, sampling cap or permission to pad", () => {
  const candidates = Array.from({ length: 600 }, (_, i) =>
    member(i, i < 200 ? 0 : i < 550 ? 1 : 2),
  );
  expect(
    selectSeedCandidates(candidates, { ...definition, targetCount: 500 })
      .members,
  ).toHaveLength(550);
  const underGoal = selectSeedCandidates(candidates, {
    ...definition,
    targetCount: 1000,
  });
  expect(underGoal.goalMet).toBe(false);
  expect(underGoal.members.some((m) => m.emailHash === hash(599))).toBe(true);
  expect(selectSeedCandidates(candidates, definition).members).toHaveLength(
    600,
  );
  expect(selectSeedCandidates([member(1, 0)], definition).members).toHaveLength(
    1,
  );
});
test("membership unions identities and accumulates repeated-view evidence across radius steps without mutating source snapshots", () => {
  const candidates = [member(1, 0, 1), member(1, 1, 1), member(2, 1)];
  const before = JSON.stringify(candidates);
  const selected = selectSeedCandidates(candidates, definition);
  expect(selected.expansion.map((r) => r.count)).toEqual([0, 2, 2]);
  expect(selected.members.find((m) => m.emailHash === hash(1))?.score).toBe(45);
  expect(new Set(selected.members.map((m) => m.emailHash)).size).toBe(2);
  expect(JSON.stringify(candidates)).toBe(before);
});
test("explicit exclusions cannot re-enter through another source or wider geography", () => {
  const candidates = [member(1, 0), member(1, 2), member(2, 0), member(3, 0)];
  candidates.push({
    emailHash: hash(2),
    evidence: [{ ...member(2, 2).evidence[0]!, search: "exclude" }],
  });
  const d = seedDefinitionSchema.parse({
    ...definition,
    excludedHashes: [hash(1)],
    searches: [
      ...definition.searches,
      {
        key: "exclude",
        why: "Explicit excluded activity",
        exclude: true,
        filter: { terms: ["exclude"] },
      },
    ],
  });
  expect(
    selectSeedCandidates(candidates, d).members.map((m) => m.emailHash),
  ).toEqual([hash(3)]);
});
