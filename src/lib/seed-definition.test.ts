import { expect, test } from "bun:test";
import { selectSeedMembers } from "./seed-definition";

const hash = (n: number) => n.toString(16).padStart(64, "0");

test("one member per person, scored on combined activity against the floor", () => {
  const result = selectSeedMembers(
    [
      { emailHash: hash(1), bookings: 0, views: 1, dates: 0, checkouts: 0 },
      { emailHash: hash(1), bookings: 0, views: 1, dates: 0, checkouts: 0 },
      { emailHash: hash(2), bookings: 0, views: 1, dates: 0, checkouts: 0 },
      { emailHash: hash(3), bookings: 1, views: 0, dates: 0, checkouts: 0 },
    ],
    45,
  );
  expect(result.hashes).toEqual([hash(1), hash(3)]);
  expect(result.evidence).toEqual({
    bookers: 1,
    checkouts: 0,
    dates: 0,
    views: 1,
  });
  expect(result.candidates).toBe(3);
});
