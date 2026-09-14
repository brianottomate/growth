import { describe, expect, it } from "bun:test";

import {
  adFormatFor,
  audienceLabelForKind,
  audienceLabelForPlan,
  audiencePlanFor,
  performanceAdBusinessKey,
  buildPerformanceAdPlan,
  dailyBudgetFromMedia,
  performanceAdName,
  performanceAdSetName,
  campaignDraftName,
  performanceCampaignName,
  performanceNamePrefix,
  performancePeriod,
  hostScopedConversionRule,
  performanceConversionName,
} from "./performance-ads";

// The live Away & Stay build is the reference these conventions come from, so
// the tests assert against its actual names and structure.

// Brooke's convention (2026-09-09): every level starts with the platform and
// the brand; PERF+ marks client spend for finance.
describe("naming", () => {
  it("names a client campaign by sale, purchase and month", () => {
    expect(
      performanceCampaignName({ customer: "Winter Park Escapes", period: "202609" }),
    ).toBe("META_PERF+WINTER+PARK+ESCAPES_SALES_PURCHASE_202609");
  });

  it("defaults the period to the current month", () => {
    expect(performancePeriod(new Date("2026-09-09T12:00:00Z"))).toBe("202609");
    expect(performanceCampaignName({ customer: "Away & Stay" })).toEndWith(
      `_${performancePeriod()}`,
    );
  });

  it("keeps PERF+ off Wander's own brands", () => {
    expect(performanceNamePrefix({ brandName: "Wander", isClient: false })).toBe("META_WANDER");
    expect(performanceNamePrefix({ brandName: "", isClient: false })).toBe("META_WANDER");
    expect(performanceNamePrefix({ brandName: "Away & Stay", isClient: true })).toBe(
      "META_PERF+AWAY+STAY",
    );
  });

  it("names an ad set by audience family and booking states", () => {
    expect(
      performanceAdSetName({
        customer: "Winter Park Escapes",
        audience: "LOOKALIKE",
        states: ["tx", "CO", "Florida"],
      }),
    ).toBe("META_PERF+WINTER+PARK+ESCAPES_LOOKALIKE_TX+CO");
    expect(
      performanceAdSetName({ customer: "Winter Park Escapes", audience: "BROAD" }),
    ).toBe("META_PERF+WINTER+PARK+ESCAPES_BROAD_US");
  });

  it("maps audiences onto the three families", () => {
    expect(audienceLabelForKind("lookalike_booker_seed")).toBe("LOOKALIKE");
    expect(audienceLabelForKind("prospecting_list")).toBe("BROAD");
    expect(audienceLabelForPlan({ type: "lookalike" })).toBe("LOOKALIKE");
    expect(audienceLabelForPlan({ type: "custom" })).toBe("RETARGETING");
    expect(audienceLabelForPlan({ type: "segment" })).toBe("BROAD");
    expect(audienceLabelForPlan(null)).toBe("BROAD");
  });

  it("names an ad by format and property, property kept readable", () => {
    expect(
      performanceAdName({
        customer: "Winter Park Escapes",
        format: "Carousel",
        propertyName: "Roam River Mansion",
      }),
    ).toBe("META_PERF+WINTER+PARK+ESCAPES_CAROUSEL_Roam River Mansion");
    expect(
      performanceAdName({ customer: "X", format: "Influencer Video", propertyName: "Villa 9" }),
    ).toBe("META_PERF+X_INFLUENCER_VIDEO_Villa 9");
  });

  it("reads the format off the ad's media", () => {
    expect(adFormatFor({ media: [{ type: "image" }] })).toBe("Static");
    expect(adFormatFor({ media: [{ type: "image" }, { type: "image" }] })).toBe("Carousel");
    expect(adFormatFor({ media: [{ type: "video" }] })).toBe("Video");
  });
});

describe("business key", () => {
  it("is stable across surfaces for the same ad", () => {
    const a = performanceAdBusinessKey({
      accountId: "perf_abc",
      period: "2026-08",
      adName: "PropertyB_Static_Wander Pawleys Island",
    });
    const b = performanceAdBusinessKey({
      accountId: " PERF_ABC ",
      period: "2026-08",
      adName: "propertyb_static_wander pawleys island",
    });
    expect(a).toBe(b);
  });

  it("separates the same ad across cycles, so a relaunch is a new ad", () => {
    const august = performanceAdBusinessKey({
      accountId: "perf_abc",
      period: "2026-08",
      adName: "AllProperties_Carousel",
    });
    const september = performanceAdBusinessKey({
      accountId: "perf_abc",
      period: "2026-09",
      adName: "AllProperties_Carousel",
    });
    expect(august).not.toBe(september);
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

describe("the name a draft is born with", () => {
  it("leads with the finance prefix for a paying client", () => {
    expect(
      campaignDraftName({ brandName: "Forever Stays", isClient: true, period: "202609" }),
    ).toBe("META_PERF+FOREVER+STAYS_SALES_PURCHASE_202609");
  });

  it("keeps the same shape without PERF+ for Wander's own brands", () => {
    // Finance filters spend on PERF+; a Wander brand under that prefix would
    // be billed to a client that does not exist.
    expect(campaignDraftName({ brandName: "Wander", isClient: false, period: "202609" })).toBe(
      "META_WANDER_SALES_PURCHASE_202609",
    );
    expect(campaignDraftName({ brandName: "", isClient: false, period: "202609" })).toBe(
      "META_WANDER_SALES_PURCHASE_202609",
    );
  });
});

describe("conversion scoping", () => {
  it("names the custom conversion with the Performance prefix and the event", () => {
    expect(
      performanceConversionName({ customer: "Winter Park Escapes", event: "PURCHASE" }),
    ).toBe("META_PERF+WINTER+PARK+ESCAPES_PURCHASE");
    expect(
      performanceConversionName({ customer: "Wander", isClient: false, event: "purchase" }),
    ).toBe("META_WANDER_PURCHASE");
  });

  it("writes the rule in Meta's grammar", () => {
    expect(hostScopedConversionRule("winterparkescapes.com")).toEqual({
      url: { i_contains: "winterparkescapes.com" },
    });
  });
});
