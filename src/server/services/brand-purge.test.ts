import { describe, expect, it } from "bun:test";

import { purgeBlockers, purgeConfirmationMatches } from "./brand-ops.service";

/**
 * Purging a brand cascades across 37 tables, deletes bytes out of R2 and
 * disconnects a client's platform authorisations. These two rules are the only
 * thing between an operator and that, so they are pinned here.
 */
describe("brand purge guards", () => {
  it("refuses while financial records still point at the brand", () => {
    expect(
      purgeBlockers({ performance_accounts: 2, partner_programs: 0 }),
    ).toHaveLength(1);
    expect(
      purgeBlockers({ performance_accounts: 0, partner_programs: 1 }),
    ).toHaveLength(1);
    expect(
      purgeBlockers({ performance_accounts: 1, partner_programs: 3 }),
    ).toHaveLength(2);
  });

  it("allows a brand carrying only marketing data", () => {
    expect(
      purgeBlockers({ performance_accounts: 0, partner_programs: 0 }),
    ).toEqual([]);
  });

  it("requires the name exactly, forgiving only surrounding whitespace", () => {
    expect(purgeConfirmationMatches("Homi", "Homi")).toBe(true);
    expect(purgeConfirmationMatches("Homi", "  Homi  ")).toBe(true);
    expect(purgeConfirmationMatches("Homi", "homi")).toBe(false);
    expect(purgeConfirmationMatches("Homi", "Hom")).toBe(false);
    expect(purgeConfirmationMatches("Homi", "")).toBe(false);
    expect(purgeConfirmationMatches("Homi", "Homi Inc")).toBe(false);
  });
});
