import { describe, expect, it } from "bun:test";

import { geographyByLookup } from "./geography-resolve.service";

/**
 * The fallback path, which is what runs when the model call fails — a pitch
 * page must still render. It has to collapse the case we know by name, since
 * that is the one that reached a client: the plan carried both "OH" and
 * "OHIO", so the ad copy read "OH, OHIO".
 */
describe("geographyByLookup", () => {
  const hockingHills = [
    { city: "Logan", state: "OH", country: "US" },
    { city: "Logan", state: "Ohio", country: "US" },
    { city: "South Bloomingville", state: "OH", country: "US" },
  ];

  it("collapses a state written both ways into one code", () => {
    const plan = geographyByLookup(hockingHills);
    expect(plan.states).toEqual(["OH"]);
    expect(plan.regions).toEqual(["Ohio"]);
  });

  it("keeps the distinct cities and country", () => {
    const plan = geographyByLookup(hockingHills);
    expect(plan.cities).toEqual(["Logan", "South Bloomingville"]);
    expect(plan.countries).toEqual(["US"]);
  });

  it("keeps a non-US region visible rather than dropping it", () => {
    // No US code exists for it, so it must survive as-is: a silently empty
    // geography would target everywhere.
    const plan = geographyByLookup([
      { city: "Chamonix", state: "Haute-Savoie", country: "FR" },
    ]);
    expect(plan.countries).toEqual(["FR"]);
    expect(plan.states).toEqual(["HAUTE-SAVOIE"]);
    expect(plan.cities).toEqual(["Chamonix"]);
  });

  it("omits keys entirely when nothing is known", () => {
    expect(geographyByLookup([])).toEqual({});
    expect(
      geographyByLookup([{ city: null, state: null, country: null }]),
    ).toEqual({});
  });
});
