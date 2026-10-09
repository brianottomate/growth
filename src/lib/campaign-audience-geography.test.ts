import { expect, test } from "bun:test";
import {
  matchAudienceLocation,
  normalizeAudienceGeography,
} from "./audience-targeting-geography";

test("export keeps US state intent and preserves international regions and city targets", () => {
  expect(
    normalizeAudienceGeography({
      countries: ["US"],
      states: ["TN"],
      regions: ["Tennessee", "Ohio"],
    }),
  ).toEqual({
    countries: ["US"],
    states: ["TN", "OH"],
    regions: [],
  });
  expect(
    normalizeAudienceGeography({
      countries: ["CA"],
      regions: ["Ontario"],
      cities: ["Toronto"],
    }),
  ).toEqual({
    countries: ["CA"],
    states: [],
    regions: ["Ontario"],
    cities: ["Toronto"],
  });
});

test("location export rejects fuzzy or ambiguous results that would change delivery", () => {
  expect(
    matchAudienceLocation("Ohio", "region", [
      { name: "Ohio", type: "city" },
      { name: "Ohio County", type: "region" },
    ]),
  ).toBeUndefined();
  expect(
    matchAudienceLocation("Springfield", "city", [
      { name: "Springfield", type: "city", path: ["Illinois"] },
      { name: "Springfield", type: "city", path: ["Missouri"] },
    ]),
  ).toBeUndefined();
  expect(
    matchAudienceLocation("Springfield, IL", "city", [
      { name: "Springfield", type: "city", path: ["Illinois"] },
      { name: "Springfield", type: "city", path: ["Missouri"] },
    ])?.path,
  ).toEqual(["Illinois"]);
});
