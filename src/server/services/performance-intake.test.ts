import { describe, expect, it } from "bun:test";

import { intakeBrandRef } from "@/lib/intake-ref";

import {
  accessCheckAllowed,
  ACCESS_CHECK_INTERVAL_MS,
  applyBlockers,
  currentPeriod,
  matchBrandPage,
  normalizePageName,
  parseBudgetDollars,
  propertyRowsFromAnswers,
} from "./performance-intake.service";

/**
 * The intake blob is deliberately untyped, so these rules are the whole
 * contract between what a client typed and what reaches money, Meta's terms,
 * the campaign compiler, and whose Page an ad ends up running under.
 */
describe("intake budget parsing", () => {
  it("reads the presets and free text the form produces", () => {
    expect(parseBudgetDollars("$6,400")).toBe(6400);
    expect(parseBudgetDollars("6400")).toBe(6400);
    expect(parseBudgetDollars("$2,000 per month")).toBe(2000);
    expect(parseBudgetDollars("7500.49")).toBe(7500);
  });

  it("returns null rather than zero for anything unusable", () => {
    // A zero budget would pass a `!= null` check and set a campaign spending
    // limit of nothing, which reads as "no cap" in more places than it should.
    expect(parseBudgetDollars(undefined)).toBeNull();
    expect(parseBudgetDollars("")).toBeNull();
    expect(parseBudgetDollars("recommend")).toBeNull();
    expect(parseBudgetDollars("$0")).toBeNull();
  });
});

describe("apply blockers", () => {
  const base = {
    status: "submitted",
    guestListConsentAt: null,
    answers: {},
  };

  it("passes a clean submission", () => {
    expect(applyBlockers(base)).toHaveLength(0);
  });

  it("refuses a guest list that arrived without the attestation", () => {
    // Meta's Custom Audience terms require it, and under one shared ad account
    // an unlawful upload risks every client's delivery, not just this one.
    expect(
      applyBlockers({ ...base, answers: { guestListName: "guests.csv" } }),
    ).toHaveLength(1);
  });

  it("allows a guest list once the attestation is timestamped", () => {
    expect(
      applyBlockers({
        ...base,
        guestListConsentAt: new Date(),
        answers: { guestListName: "guests.csv" },
      }),
    ).toHaveLength(0);
  });

  it("refuses to apply twice", () => {
    // Re-applying would reopen a cycle an operator may have since adjusted.
    expect(applyBlockers({ ...base, status: "applied" })).toHaveLength(1);
  });
});

describe("property rows", () => {
  it("skips homes already on the account, case-insensitively", () => {
    const rows = propertyRowsFromAnswers(
      "perf_1",
      { properties: ["Roam River Mansion", "arrow penthouse 215"] },
      ["Arrow Penthouse 215"],
    );
    expect(rows.map((row) => row.title)).toEqual(["Roam River Mansion"]);
  });

  it("dedupes repeats within one submission", () => {
    const rows = propertyRowsFromAnswers(
      "perf_1",
      { properties: ["The Kiln House", "The Kiln House", "  "] },
      [],
    );
    expect(rows).toHaveLength(1);
  });

  it("never guesses a URL from a title", () => {
    // A fabricated link would 404 inside a live ad, so siteUrl stays null
    // until someone matches the home against the booking site.
    const [row] = propertyRowsFromAnswers(
      "perf_1",
      { properties: ["Cedar & Ninth"] },
      [],
    );
    expect(row?.siteUrl).toBeNull();
  });
});

describe("cycle period", () => {
  it("matches performance_cycle.period's YYYY-MM shape", () => {
    expect(currentPeriod(new Date(Date.UTC(2026, 8, 2)))).toBe("2026-09");
    expect(currentPeriod(new Date(Date.UTC(2026, 11, 31)))).toBe("2026-12");
  });
});

describe("brand page matching", () => {
  const pages = [
    { id: "101", name: "Wander" },
    { id: "102", name: "WanderOS" },
    { id: "774", name: "Winter Park Escapes" },
    { id: "603", name: "Bank Newsletter Investment Management" },
  ];

  it("matches through case and punctuation differences", () => {
    expect(normalizePageName("Winter Park Escapes!")).toBe(
      "winter park escapes",
    );
    expect(matchBrandPage("winter-park escapes", pages)?.id).toBe("774");
  });

  it("never matches a page that merely contains the brand name", () => {
    // "Wander" must not bind to "WanderOS". A wrong match here runs a client's
    // ads under someone else's identity, so no match beats a near miss.
    expect(matchBrandPage("Wander", pages)?.id).toBe("101");
    expect(matchBrandPage("Wander O", pages)).toBeNull();
  });

  it("returns nothing when two pages share a name", () => {
    expect(
      matchBrandPage("Duplicate", [
        { id: "1", name: "Duplicate" },
        { id: "2", name: "duplicate" },
      ]),
    ).toBeNull();
  });

  it("returns nothing rather than guessing when the grant has not landed", () => {
    expect(matchBrandPage("Homi", pages)).toBeNull();
    expect(matchBrandPage("", pages)).toBeNull();
  });
});

describe("brand reference", () => {
  it("prefers the snapshot slug and falls back to the id", () => {
    expect(
      intakeBrandRef({ brandSlug: "winter-park-escapes", brandId: "brand_1" }),
    ).toBe("winter-park-escapes");
    // Reference brands carry no slug, and a purged brand leaves brandId null.
    expect(intakeBrandRef({ brandSlug: null, brandId: "brand_1" })).toBe(
      "brand_1",
    );
    expect(intakeBrandRef({ brandSlug: null, brandId: null })).toBe(
      "unknown brand",
    );
  });
});

describe("public access-check throttle", () => {
  const now = new Date("2026-09-02T10:00:00Z");

  it("allows a first check", () => {
    expect(accessCheckAllowed(null, now)).toBe(true);
  });

  it("refuses a second check inside the window", () => {
    // The route is unauthenticated and reaches Zernio and then Meta, so this
    // is the only thing between a shared link and someone else's rate limit.
    const justNow = new Date(now.getTime() - ACCESS_CHECK_INTERVAL_MS + 1_000);
    expect(accessCheckAllowed(justNow, now)).toBe(false);
  });

  it("allows again once the window has passed", () => {
    const earlier = new Date(now.getTime() - ACCESS_CHECK_INTERVAL_MS);
    expect(accessCheckAllowed(earlier, now)).toBe(true);
  });
});
