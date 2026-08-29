import { describe, expect, it } from "bun:test";

import { assertMetaAdPayload } from "@/server/services/ads-write.service";
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

  it("enforces the ad account's daily minimum", () => {
    expect(() =>
      assertMetaAdPayload({ ...base, budgetAmount: 5 }, account),
    ).toThrow(/at least 10 USD/);
  });
});
