import { describe, expect, test } from "bun:test";
import {
  performanceCardFromBrand,
  performanceWebsiteUrl,
} from "./performance-card";
import {
  mergePerformanceCardState,
  performanceCardStateSchema,
  performanceAmountSchema,
  recordedPlatforms,
} from "./performance-card-state";

const brand = {
  id: "client",
  name: "Client",
  slug: "client",
  logo: null,
  website: null,
  relationship: "client",
  campaigns: [{ adCount: 3 }],
};

describe("Recorded Performance card state", () => {
  test("catalog rework preserves a live platform and the manual journey", () => {
    expect(
      performanceCardStateSchema.safeParse({ catalog: "Live" }).success,
    ).toBe(true);
    const current = {
      catalog: "Live",
      meta: "Live",
      managementPayment: "Paid",
      emailDns: "Verified",
    } as const;
    const state = mergePerformanceCardState(current, {
      catalog: "In production",
    });
    const card = performanceCardFromBrand({
      ...brand,
      settings: { pipelineStage: "live", cardState: state },
    });
    expect(card.state).toEqual({ ...current, catalog: "In production" });
    expect(card.stage).toBe("live");
    expect(current.catalog).toBe("Live");
  });
  test("pausing delivery and clearing a fact do not reset other recorded work", () => {
    expect(
      mergePerformanceCardState(
        { meta: "Live", google: "Live", ads: "Approved", emailDns: "Verified" },
        { meta: "Paused", emailDns: null, ads: undefined },
      ),
    ).toEqual({
      meta: "Paused",
      google: "Live",
      ads: "Approved",
      emailDns: null,
    });
  });
  test("campaign counts do not imply delivery, payment, or client progression", () => {
    const card = performanceCardFromBrand(brand);
    expect(card.stage).toBe("signed");
    expect(card.state).toEqual({});
    expect(card.management).toBeNull();
    expect(card.spend).toBeNull();
    expect(card.adCount).toBe(3);
  });
  test("configured amounts and zero spend survive without billing-cycle defaults", () => {
    const card = performanceCardFromBrand({
      ...brand,
      settings: {
        monthlyFee: 3000,
        agreedAdSpend: 0,
        pipelineStage: "onboarding",
        cardState: { managementPayment: "Paid", meta: "Live" },
      },
    });
    expect(card.management).toBe(3000);
    expect(card.spend).toBe(0);
    expect(card.stage).toBe("onboarding");
  });
  test("Zernio access is independently recorded and survives creative updates", () => {
    const state = mergePerformanceCardState(
      { zernioAccess: "Connected", meta: "Paused" },
      { ads: "In production" },
    );
    expect(state).toEqual({
      zernioAccess: "Connected",
      meta: "Paused",
      ads: "In production",
    });
    expect(
      performanceCardStateSchema.safeParse({ zernioAccess: "Claimed" }).success,
    ).toBe(false);
    expect(performanceCardFromBrand(brand).state.zernioAccess).toBeUndefined();
  });
  test("not-created platforms stay hidden without hiding draft and paused work", () => {
    expect(recordedPlatforms({ meta: "Draft", google: "Not created" })).toEqual(
      [{ label: "Meta", status: "Draft" }],
    );
    expect(recordedPlatforms({ meta: "Paused", google: "Live" })).toHaveLength(
      2,
    );
    expect(recordedPlatforms({})).toEqual([]);
  });
  test("state input rejects unsupported statuses and invalid recorded facts", () => {
    for (const state of [
      { meta: "Pushed" },
      { catalog: "Fully approved" },
      { includedHomes: -1 },
      { includedHomes: 1.5 },
      { billingPeriod: "2026-13" },
      { unexpected: "Live" },
    ]) {
      expect(performanceCardStateSchema.safeParse(state).success).toBe(false);
    }
    expect(
      performanceCardStateSchema.safeParse({
        meta: "Live",
        catalog: "In production",
        managementPayment: "Open",
        spendPayment: "Paid",
        emailDns: null,
      }).success,
    ).toBe(true);
  });
  test("confirmed fees retain cents instead of rounding to a fixture amount", () => {
    expect(performanceAmountSchema.safeParse(2666.67).success).toBe(true);
    expect(performanceAmountSchema.safeParse(2666.671).success).toBe(false);
    expect(
      performanceCardFromBrand({ ...brand, settings: { monthlyFee: 2666.67 } })
        .management,
    ).toBe(2666.67);
  });
  test("external website links allow only web protocols", () => {
    expect(performanceWebsiteUrl("client.com")).toBe("https://client.com/");
    expect(performanceWebsiteUrl("https://client.com")).toBe(
      "https://client.com/",
    );
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,test",
      "ftp://client.com",
      null,
    ])
      expect(performanceWebsiteUrl(url)).toBeNull();
  });
});
