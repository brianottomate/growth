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
  prefillContact,
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
  it("lets a submitted intake through", () => {
    // Nothing apply writes reaches a platform, so there is no reason to refuse
    // a submission on its contents.
    expect(applyBlockers({ status: "submitted" })).toHaveLength(0);
  });

  it("refuses to apply twice", () => {
    // Re-applying would reopen a cycle an operator may have since adjusted.
    expect(applyBlockers({ status: "applied" })).toHaveLength(1);
  });
});

describe("property rows", () => {
  it("carries the client's URL onto the row", () => {
    const rows = propertyRowsFromAnswers(
      "perf_1",
      { propertyUrls: ["https://winterparkescapes.com/homes/roam"] },
      [],
    );
    expect(rows).toEqual([
      {
        accountId: "perf_1",
        siteUrl: "https://winterparkescapes.com/homes/roam",
        title: null,
      },
    ]);
  });

  it("dedupes against existing rows and within a submission", () => {
    // Trailing slash and case differ; it is the same listing.
    const rows = propertyRowsFromAnswers(
      "perf_1",
      {
        propertyUrls: [
          "https://WinterParkEscapes.com/homes/roam/",
          "https://winterparkescapes.com/homes/arrow",
          "https://winterparkescapes.com/homes/arrow",
        ],
      },
      ["https://winterparkescapes.com/homes/roam"],
    );
    expect(rows.map((row) => row.siteUrl)).toEqual([
      "https://winterparkescapes.com/homes/arrow",
    ]);
  });

  it("invents nothing for an all-properties request", () => {
    // "Advertise everything" is an instruction to the operator, not a list.
    expect(propertyRowsFromAnswers("perf_1", { allProperties: true }, [])).toHaveLength(0);
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

describe("prefill contact fields", () => {
  it("uses the commercial record when a token addressed the form", () => {
    expect(
      prefillContact(true, { contactName: "Cynthia", contactEmail: "c@wpe.com" }),
    ).toEqual({ contact: "Cynthia", email: "c@wpe.com" });
  });

  it("returns null rather than the Wander rep when no account exists", () => {
    // The rep who minted the link must never stand in for the client, or the
    // form asks a client to confirm their own rep's name and email.
    expect(prefillContact(true, null)).toEqual({ contact: null, email: null });
  });

  it("withholds contact details from a guessable slug link", () => {
    expect(
      prefillContact(false, { contactName: "Cynthia", contactEmail: "c@wpe.com" }),
    ).toEqual({ contact: null, email: null });
  });
});
