import { describe, expect, it } from "bun:test";

import {
  audiencePlanFor,
  buildPerformanceAdPlan,
  dailyBudgetFromMedia,
  performanceAdName,
  performanceCampaignName,
  propertySlot,
} from "./performance-ads";

// The live Away & Stay build is the reference these conventions come from, so
// the tests assert against its actual names and structure.

describe("naming", () => {
  it("reproduces the live campaign name", () => {
    expect(performanceCampaignName({ customer: "Away & Stay" })).toBe(
      "OSPERF+AWAY+STAY_PROSPECTING_PURCHASES",
    );
  });

  it("keeps the finance-filterable prefix when a period is added", () => {
    expect(
      performanceCampaignName({ customer: "Away & Stay", period: "2026-08" }),
    ).toStartWith("OSPERF+AWAY+STAY_");
  });

  it("reproduces live ad names", () => {
    expect(
      performanceAdName({
        index: 1,
        format: "Static",
        propertyName: "Wander Pawleys Island",
      }),
    ).toBe("PropertyB_Static_Wander Pawleys Island");
  });

  it("keeps slots sortable past 26 properties", () => {
    expect(propertySlot(0)).toBe("A");
    expect(propertySlot(25)).toBe("Z");
    expect(propertySlot(26)).toBe("AA");
  });
});

describe("audience count follows budget", () => {
  it("runs a single lookalike at Away & Stay's budget", () => {
    expect(audiencePlanFor(400)).toEqual(["lookalike_booker_seed"]);
  });

  it("adds the prospecting list once there is money to split", () => {
    expect(audiencePlanFor(1_000)).toHaveLength(2);
  });

  it("opens up the full set at agency-scale budgets", () => {
    expect(audiencePlanFor(10_000)).toHaveLength(3);
  });
});

describe("daily budget", () => {
  it("derives from media budget, not the billed amount", () => {
    // $500 billed / $400 media: the customer's plan is 400.
    expect(dailyBudgetFromMedia({ mediaBudget: 400, days: 30 })).toBe(13.33);
  });

  it("splits across ad sets so a multi-audience build stays in plan", () => {
    expect(
      dailyBudgetFromMedia({ mediaBudget: 3_000, days: 30, adSets: 2 }),
    ).toBe(50);
  });

  it("never rounds a customer's budget up", () => {
    expect(dailyBudgetFromMedia({ mediaBudget: 100, days: 30 })).toBe(3.33);
  });

  it("floors at the account minimum", () => {
    expect(dailyBudgetFromMedia({ mediaBudget: 5, days: 30 })).toBe(1);
  });

  it("rejects a zero-day period", () => {
    expect(() => dailyBudgetFromMedia({ mediaBudget: 400, days: 0 })).toThrow();
  });
});

describe("ad plan", () => {
  const properties = [
    { name: "Wander Pawleys Island", url: "https://www.wander.com/property/a" },
    { name: "The Stillmere Estate", url: "https://www.wander.com/property/b" },
    { name: "Wander North Myrtle Vineyard", url: "https://www.wander.com/property/c" },
    { name: "Pawleys Island Fairway Retreat", url: "https://www.wander.com/property/d" },
  ];

  it("produces the 10 ads the live build shipped for 4 properties", () => {
    const plan = buildPerformanceAdPlan({ customer: "Away & Stay", properties });
    expect(plan).toHaveLength(10);
    expect(plan.filter((ad) => ad.kind === "static")).toHaveLength(4);
    expect(plan.filter((ad) => ad.kind === "carousel")).toHaveLength(4);
  });

  it("keeps the portfolio carousel and the catalog ad as separate ads", () => {
    const plan = buildPerformanceAdPlan({ customer: "Away & Stay", properties });
    expect(plan.some((ad) => ad.kind === "all_properties_carousel")).toBe(true);
    expect(plan.some((ad) => ad.kind === "catalog")).toBe(true);
  });

  it("scales to a portfolio without changing shape", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      name: `Home ${i}`,
      url: `https://www.wander.com/property/${i}`,
    }));
    expect(buildPerformanceAdPlan({ customer: "X", properties: many })).toHaveLength(42);
  });

  it("refuses an empty portfolio", () => {
    expect(() =>
      buildPerformanceAdPlan({ customer: "Away & Stay", properties: [] }),
    ).toThrow();
  });
});
