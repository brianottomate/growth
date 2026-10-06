import { expect, test } from "bun:test";
import { campaignGeography } from "./campaign-audience-geography";

test("city suggestions retain evidenced states without reintroducing covered targeting", () => {
  expect(
    campaignGeography(
      { states: [], cities: ["Atlanta", "Nashville", "Unknown"] },
      [
        { city: "Atlanta", state: "GA" },
        { city: "Nashville", state: "TN" },
      ],
      new Set(["TN"]),
    ),
  ).toEqual({ states: ["GA"], cities: ["Atlanta"] });
  expect(
    campaignGeography(
      { states: ["Georgia"], cities: ["Springfield", "Louisville, KY"] },
      [
        { city: "Springfield", state: "IL" },
        { city: "Springfield", state: "MO" },
      ],
      new Set(),
    ),
  ).toEqual({ states: ["GA", "KY"], cities: ["Louisville, KY"] });
});
