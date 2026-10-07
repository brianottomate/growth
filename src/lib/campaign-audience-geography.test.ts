import { expect, test } from "bun:test";
import { campaignGeography } from "./campaign-audience-geography";

test("city suggestions retain evidenced states without reintroducing covered targeting", () => {
  expect(
    campaignGeography(
      { states: [], originCities: ["Atlanta", "Nashville", "Unknown"] },
      [
        { city: "Atlanta", state: "GA" },
        { city: "Nashville", state: "TN" },
      ],
      new Set(["TN"]),
    ),
  ).toEqual({ states: ["GA"], originCities: ["Atlanta"] });
  expect(
    campaignGeography(
      { states: ["Georgia"], originCities: ["Springfield", "Louisville, KY"] },
      [
        { city: "Springfield", state: "IL" },
        { city: "Springfield", state: "MO" },
      ],
      new Set(),
    ),
  ).toEqual({ states: ["GA", "KY"], originCities: ["Louisville, KY"] });
});

import {
  matchAudienceLocation,
  normalizeAudienceGeography,
} from "./audience-targeting-geography";

test("international feeder context remains separate from delivery targets", () => {
  expect(
    campaignGeography(
      { countries: ["CA"], states: [], originCities: ["Toronto"] },
      [],
      new Set(),
    ),
  ).toEqual({ states: [], originCities: ["Toronto"] });
});

test("export keeps US state intent and preserves international regions and city context", () => {
  expect(
    normalizeAudienceGeography({
      countries: ["US"],
      states: ["TN"],
      regions: ["Tennessee", "Ohio"],
      originCities: ["Nashville"],
    }),
  ).toEqual({
    countries: ["US"],
    states: ["TN", "OH"],
    regions: [],
    originCities: ["Nashville"],
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
