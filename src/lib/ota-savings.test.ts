import { describe, expect, it } from "bun:test";

import { otaSavingsUsd, stayTotalUsd } from "./ota-savings";

// Pre-tax cheapest stays and the savings wander.com printed for them on the
// California search page, 2026-09-25.
describe("otaSavingsUsd", () => {
  it.each([
    [401554, 350],
    [60804, 50],
    [248585, 215],
    [172895, 150],
  ])("matches the site for %i cents", (priceCents, expected) => {
    expect(otaSavingsUsd({ priceCents, country: "United States" })).toBe(
      expected,
    );
  });

  it("shows nothing outside the US", () => {
    expect(otaSavingsUsd({ priceCents: 401554, country: "Mexico" })).toBe(0);
  });

  it("takes a country code", () => {
    expect(otaSavingsUsd({ priceCents: 60804, country: "US" })).toBe(50);
  });
});

describe("stayTotalUsd", () => {
  it("rounds up to the dollar, like the card", () => {
    expect(stayTotalUsd(454740)).toBe(4548);
  });
});
