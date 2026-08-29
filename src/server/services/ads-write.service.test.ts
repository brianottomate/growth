import { describe, expect, it } from "bun:test";

import {
  assertMetaAdPayload,
  estimateMonthlyKeywordCost,
} from "@/server/services/ads-write.service";
import type { CreateZernioStandaloneAdInput } from "@/server/clients/zernio.client";

/**
 * The provider contract for a Meta create. Both live failures this guards
 * against were rules Zernio documents and one of our three payload builders
 * already knew — they only reached Meta because the other two did not.
 */
const base: CreateZernioStandaloneAdInput = {
  accountId: "acc_1",
  adAccountId: "act_1",
  name: "Spring",
  goal: "traffic",
  budgetAmount: 50,
  budgetType: "daily",
  headline: "Spring",
  body: "Book direct.",
  linkUrl: "https://example.com",
  imageUrl: "https://cdn.example.com/a.jpg",
};
const account = { currency: "USD", minimumDailyBudget: 10 };
const creative = {
  name: "a",
  headline: "A",
  body: "b",
  imageUrl: "https://cdn.example.com/a.jpg",
};

describe("assertMetaAdPayload", () => {
  it("accepts a minimal single-creative ad", () => {
    expect(() => assertMetaAdPayload(base, account)).not.toThrow();
  });

  it("requires an end date for a lifetime budget", () => {
    expect(() =>
      assertMetaAdPayload({ ...base, budgetType: "lifetime" }, account),
    ).toThrow(/endDate/);
    expect(() =>
      assertMetaAdPayload(
        { ...base, budgetType: "lifetime", endDate: "2026-09-30" },
        account,
      ),
    ).not.toThrow();
  });

  it("requires headline and body on every creative", () => {
    const payload = {
      ...base,
      imageUrl: undefined,
      creatives: [creative, { ...creative, headline: "" }],
    };
    expect(() => assertMetaAdPayload(payload, account)).toThrow(
      "creatives[1].headline is required",
    );
  });

  it("rejects mixing creative shapes and requires one of them", () => {
    expect(() =>
      assertMetaAdPayload({ ...base, creatives: [creative] }, account),
    ).toThrow(/one creative shape/);
    expect(() =>
      assertMetaAdPayload({ ...base, imageUrl: undefined }, account),
    ).toThrow(/image, a carousel, or a creatives array/);
  });

  it("accepts a conversions goal backed by a custom conversion, not just an event", () => {
    expect(() =>
      assertMetaAdPayload(
        {
          ...base,
          goal: "conversions",
          promotedObject: { pixelId: "px_1", customConversionId: "cc_1" },
        },
        account,
      ),
    ).not.toThrow();
    expect(() =>
      assertMetaAdPayload({ ...base, goal: "conversions" }, account),
    ).toThrow(/pixelId/);
  });

  it("lets an ad set inherit its budget rather than restating it", () => {
    const { budgetAmount: _a, budgetType: _b, ...noBudget } = base;
    // Standalone: nothing owns the money, so this is a mistake.
    expect(() => assertMetaAdPayload(noBudget, account)).toThrow(/needs a budget/);
    // Attaching to an existing ad set, and joining a CBO campaign, both have
    // an owner above them.
    expect(() =>
      assertMetaAdPayload({ ...noBudget, adSetId: "1202500" }, account),
    ).not.toThrow();
    expect(() =>
      assertMetaAdPayload({ ...noBudget, existingCampaignId: "23850" }, account),
    ).not.toThrow();
  });

  it("treats a carousel as its own creative shape", () => {
    const cards = [
      { imageUrl: "https://cdn.example.com/1.jpg", headline: "One" },
      { imageUrl: "https://cdn.example.com/2.jpg", headline: "Two" },
    ];
    expect(() =>
      assertMetaAdPayload(
        { ...base, imageUrl: undefined, carouselCards: cards },
        account,
      ),
    ).not.toThrow();
    // Mixing shapes in one call is what Meta rejects.
    expect(() =>
      assertMetaAdPayload({ ...base, carouselCards: cards }, account),
    ).toThrow(/one creative shape/);
    expect(() =>
      assertMetaAdPayload(
        { ...base, imageUrl: undefined, carouselCards: cards.slice(0, 1) },
        account,
      ),
    ).toThrow(/2\u201310 cards/);
  });

  it("enforces the ad account's daily minimum", () => {
    expect(() =>
      assertMetaAdPayload({ ...base, budgetAmount: 5 }, account),
    ).toThrow(/at least 10 USD/);
  });
});

/**
 * This number caps the Google budget, so a wrong one either starves the brand
 * campaign or spends past the point of owning the terms.
 */
describe("estimateMonthlyKeywordCost", () => {
  const row = (
    avgMonthlySearches: number | null,
    averageCpc: number | null,
    highTopOfPageBid: number | null = null,
  ) => ({ avgMonthlySearches, averageCpc, highTopOfPageBid });

  it("prices searches as clicks, not as impressions", () => {
    // 1,000 searches at 35% CTR is 350 clicks, at $2 each.
    expect(estimateMonthlyKeywordCost([row(1_000, 2)]).dollars).toBe(700);
  });

  it("falls back to the top-of-page bid when there is no average CPC", () => {
    expect(estimateMonthlyKeywordCost([row(1_000, null, 4)]).dollars).toBe(1_400);
  });

  it("reports what it could not price rather than treating it as free", () => {
    const result = estimateMonthlyKeywordCost([
      row(1_000, 2),
      row(null, 2),
      row(500, null),
    ]);
    expect(result.priced).toBe(1);
    expect(result.unpriced).toBe(2);
    expect(result.dollars).toBe(700);
  });

  it("carries the CTR assumption out with the number", () => {
    const result = estimateMonthlyKeywordCost([row(1_000, 2)], 0.5);
    expect(result.dollars).toBe(1_000);
    expect(result.ctrAssumption).toBe(0.5);
  });
});
