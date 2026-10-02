import { describe, expect, test } from "bun:test";
import { journeyColumn, matchesPortfolio } from "./performance-journey";

describe("Performance journey", () => {
  test("signed and paid clients awaiting intake are onboarding, not sales leads", () => {
    expect(journeyColumn({ business: "signed", delivery: "not_started" })).toBe(
      "Onboarding",
    );
    expect(journeyColumn({ business: "paid", delivery: "intake_sent" })).toBe(
      "Onboarding",
    );
    expect(
      journeyColumn({ business: "prospect", delivery: "not_started" }),
    ).toBe("Prospecting");
  });
  test("paused and closed relationships override delivery so they never look live", () => {
    expect(journeyColumn({ business: "paused", delivery: "live" })).toBe(
      "Paused",
    );
    expect(journeyColumn({ business: "paid", delivery: "paused" })).toBe(
      "Paused",
    );
    expect(journeyColumn({ business: "churned", delivery: "live" })).toBe(
      "Closed",
    );
    expect(journeyColumn({ business: "lost", delivery: "ads_review" })).toBe(
      "Closed",
    );
  });
  test("building, review, and live remain distinct from commercial stage", () => {
    expect(
      journeyColumn({ business: "signed", delivery: "access_verified" }),
    ).toBe("Building");
    expect(
      journeyColumn({ business: "prospect", delivery: "ads_review" }),
    ).toBe("Ready for review");
    expect(journeyColumn({ business: "signed", delivery: "live" })).toBe(
      "Live",
    );
  });
  test("portfolio search requires every term and ignores whitespace and casing", () => {
    expect(
      matchesPortfolio(
        "Winter Park Escapes winterparkescapes.com",
        "  PARK winter  ",
      ),
    ).toBe(true);
    expect(matchesPortfolio("Winter Park Escapes", "winter beach")).toBe(false);
    expect(matchesPortfolio("Winter Park", " ")).toBe(true);
  });
});
