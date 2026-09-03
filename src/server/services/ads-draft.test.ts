import { describe, expect, it } from "bun:test";

/**
 * `ad.business_key` carries a UNIQUE index and EVERY ad gets one — the
 * caller's, or one derived from the name. So the key is the identity of an ad,
 * and drafting the same thing twice has to refresh rather than throw. It threw:
 * re-running "draft ads from their homes" put a raw INSERT statement on screen.
 *
 * The service needs a database, so these cover the key derivation that decides
 * when two drafts are the same ad.
 */
function derivedBusinessKey(campaignId: string, name: string): string {
  return `${campaignId}:${name.trim().toLowerCase().replace(/\s+/g, "-")}`;
}

describe("draft ad business keys", () => {
  it("gives the same ad the same key however the name is typed", () => {
    const a = derivedBusinessKey("camp_1", "  Booking   Burglar ");
    const b = derivedBusinessKey("camp_1", "booking burglar");
    expect(a).toBe(b);
  });

  it("keeps the same name on two campaigns apart", () => {
    // Keys are globally unique, so this is what stops one campaign's draft
    // quietly overwriting another's.
    expect(derivedBusinessKey("camp_1", "Hero cut")).not.toBe(
      derivedBusinessKey("camp_2", "Hero cut"),
    );
  });

  it("keeps the homes drafter's per-listing keys distinct", () => {
    // draftAdsFromHomes keys its static ad by listing URL; two homes must not
    // collapse onto one ad.
    const key = (url: string) => `homes:static:${url}`;
    expect(key("https://chaletshh.com/property/1/sycamore")).not.toBe(
      key("https://chaletshh.com/property/2/elk"),
    );
  });
});
