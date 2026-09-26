import { describe, expect, test } from "bun:test";

import { splitCityFromName } from "./digest-extract.service";

describe("splitCityFromName", () => {
  test("a bracketed city becomes the city", () => {
    expect(
      splitCityFromName({
        name: "Wander Breckenridge Loft (Breckenridge)",
        city: null as string | null,
      }),
    ).toEqual({ name: "Wander Breckenridge Loft", city: "Breckenridge" });
  });

  test("it agrees with a city already read", () => {
    expect(
      splitCityFromName({
        name: "Elevate Villas 4C (Brian Head)",
        city: "brian head",
      }),
    ).toEqual({ name: "Elevate Villas 4C", city: "brian head" });
  });

  test("a bracket naming somewhere else is part of the name", () => {
    const home = { name: "Smith Rock Retreat (The Spot)", city: "Terrebonne" };
    expect(splitCityFromName(home)).toEqual(home);
  });
});
