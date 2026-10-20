import { describe, expect, it } from "bun:test";
import type { CreateZernioStandaloneAdInput } from "@/server/clients/zernio.client";
import { assertOpenAiAdPayload } from "@/server/services/ads-write.service";

/**
 * The provider contract for an OpenAI chat card, as Zernio documents and
 * its validateOnly confirmed live (2026-10-20): no attach shapes, a 3–50
 * title, a 100-character body, country-only targeting, and fixed bidding
 * wherever Maximize Results is refused.
 */
const base: CreateZernioStandaloneAdInput = {
  accountId: "acc_1",
  adAccountId: "adacct_1",
  name: "Performance beta",
  goal: "traffic",
  budgetAmount: 50,
  budgetType: "daily",
  headline: "Direct bookings, done for you",
  body: "The marketing engine behind $100M+ in Wander bookings.",
  linkUrl: "https://www.wander.com/performance-beta",
  imageUrl: "https://cdn.example.com/card.png",
  countries: ["US"],
  status: "PAUSED",
};
const account = { currency: "USD" };

describe("assertOpenAiAdPayload", () => {
  it("accepts a traffic chat card on a daily budget", () => {
    expect(() => assertOpenAiAdPayload(base, account)).not.toThrow();
  });
  it("refuses the attach shapes Zernio has no OpenAI support for", () => {
    expect(() =>
      assertOpenAiAdPayload({ ...base, adSetId: "adgrp_1" }, account),
    ).toThrow(/no attach/);
    expect(() =>
      assertOpenAiAdPayload({ ...base, existingCampaignId: "cmpn_1" }, account),
    ).toThrow(/no attach/);
  });
  it("holds the title and body to OpenAI's limits and points at the placement", () => {
    expect(() =>
      assertOpenAiAdPayload(
        {
          ...base,
          headline: "A title that runs well past fifty characters, for certain",
        },
        account,
      ),
    ).toThrow(/3–50 characters.*ChatGPT placement/);
    expect(() =>
      assertOpenAiAdPayload({ ...base, body: "x".repeat(101) }, account),
    ).toThrow(/1–100 characters/);
  });
  it("requires countries and refuses any other targeting dimension", () => {
    expect(() =>
      assertOpenAiAdPayload({ ...base, countries: [] }, account),
    ).toThrow(/country only/);
    expect(() =>
      assertOpenAiAdPayload({ ...base, targeting: { ageMin: 25 } }, account),
    ).toThrow(/no targeting beyond countries/);
  });
  it("needs a fixed bid for awareness and for lifetime budgets", () => {
    expect(() =>
      assertOpenAiAdPayload({ ...base, goal: "awareness" }, account),
    ).toThrow(/fixed bid/);
    expect(() =>
      assertOpenAiAdPayload(
        {
          ...base,
          goal: "awareness",
          bidStrategy: "COST_CAP",
          bidAmount: 2,
        },
        account,
      ),
    ).not.toThrow();
    expect(() =>
      assertOpenAiAdPayload(
        { ...base, budgetType: "lifetime", endDate: "2026-12-31" },
        account,
      ),
    ).toThrow(/fixed bid/);
  });
  it("needs the tracking tag's event for a conversions campaign", () => {
    expect(() =>
      assertOpenAiAdPayload({ ...base, goal: "conversions" }, account),
    ).toThrow(/customEventType/);
    expect(() =>
      assertOpenAiAdPayload(
        {
          ...base,
          goal: "conversions",
          promotedObject: { customEventType: "Performance Apply Submitted" },
        },
        account,
      ),
    ).not.toThrow();
    expect(() =>
      assertOpenAiAdPayload(
        {
          ...base,
          goal: "conversions",
          promotedObject: { customEventType: "lead", pixelId: "123" },
        },
        account,
      ),
    ).toThrow(/customEventType only/);
  });
});
