import { describe, expect, it } from "bun:test";

import { usStateCode, usStateName } from "./us-states";

/**
 * Listing data carries the state both ways. A portfolio in Hocking Hills had
 * homes filed under "OH" and under "Ohio", and uppercasing alone kept those as
 * two separate states — which is how a pitch page came to read "OH, OHIO".
 */
describe("usStateCode", () => {
  it("collapses a name and its code to one value", () => {
    expect(usStateCode("Ohio")).toBe("OH");
    expect(usStateCode("OH")).toBe("OH");
    expect(usStateCode("ohio")).toBe(usStateCode("oh"));
  });

  it("tolerates the whitespace and casing real rows arrive with", () => {
    expect(usStateCode("  ohio  ")).toBe("OH");
    expect(usStateCode("NEW YORK")).toBe("NY");
  });

  it("returns null rather than guessing at anything it does not know", () => {
    // Non-US markets must not be silently mapped onto a US state.
    expect(usStateCode("Bavaria")).toBeNull();
    expect(usStateCode("")).toBeNull();
    expect(usStateCode(null)).toBeNull();
    expect(usStateCode(undefined)).toBeNull();
  });

  it("round-trips against usStateName", () => {
    const code = usStateCode("Ohio");
    expect(code).not.toBeNull();
    expect(usStateName(code)).toBe("Ohio");
  });
});
