import { describe, expect, test } from "bun:test";

import type { CreateZernioStandaloneAdInput } from "@/server/clients/zernio.client";

import { assertLinkedInAdPayload } from "./ads-write.service";

const account = { currency: "USD" };

const fresh = (
  overrides: Partial<CreateZernioStandaloneAdInput> = {},
): CreateZernioStandaloneAdInput => ({
  accountId: "6a99a6a577555aae01d1dd2c",
  adAccountId: "515601419",
  name: "Supply · Q4",
  goal: "traffic",
  budgetAmount: 20,
  budgetType: "daily",
  headline: "Own your direct bookings",
  body: "WanderOS for property managers.",
  linkUrl: "https://wander.com/os",
  imageUrl: "https://cdn.example.com/hero.jpg",
  status: "PAUSED",
  ...overrides,
});

const attach = (
  overrides: Partial<CreateZernioStandaloneAdInput> = {},
): CreateZernioStandaloneAdInput => ({
  accountId: "6a99a6a577555aae01d1dd2c",
  adAccountId: "515601419",
  adSetId: "850552656",
  name: "Second creative",
  goal: "traffic",
  headline: "Own your direct bookings",
  body: "WanderOS for property managers.",
  linkUrl: "https://wander.com/os",
  imageUrl: "https://cdn.example.com/hero-2.jpg",
  status: "PAUSED",
  ...overrides,
});

describe("assertLinkedInAdPayload", () => {
  test("accepts a paused single-image traffic campaign", () => {
    expect(() => assertLinkedInAdPayload(fresh(), account)).not.toThrow();
  });

  test("holds the daily floor at LinkedIn's $10, or the account's own", () => {
    expect(() =>
      assertLinkedInAdPayload(fresh({ budgetAmount: 5 }), account),
    ).toThrow(/at least 10 USD/);
    expect(() =>
      assertLinkedInAdPayload(fresh({ budgetAmount: 12 }), {
        currency: "USD",
        minimumDailyBudget: 15,
      }),
    ).toThrow(/at least 15 USD/);
  });

  test("lifetime budgets need an end date and $100", () => {
    expect(() =>
      assertLinkedInAdPayload(
        fresh({ budgetType: "lifetime", budgetAmount: 200 }),
        account,
      ),
    ).toThrow(/endDate/);
    expect(() =>
      assertLinkedInAdPayload(
        fresh({
          budgetType: "lifetime",
          budgetAmount: 50,
          endDate: "2026-10-01",
        }),
        account,
      ),
    ).toThrow(/at least 100/);
  });

  test("refuses Meta-only shapes", () => {
    expect(() =>
      assertLinkedInAdPayload(
        fresh({
          creatives: [
            {
              name: "a",
              headline: "h",
              body: "b",
              imageUrl: "https://cdn.example.com/a.jpg",
            },
          ],
        }),
        account,
      ),
    ).toThrow(/creatives\[\]/);
    expect(() =>
      assertLinkedInAdPayload(
        fresh({
          imageUrl: undefined,
          carouselCards: [
            { imageUrl: "https://cdn.example.com/a.jpg" },
            { imageUrl: "https://cdn.example.com/b.jpg" },
          ],
        }),
        account,
      ),
    ).toThrow(/platformSpecificData\.carousel/);
    expect(() =>
      assertLinkedInAdPayload(fresh({ validateOnly: true }), account),
    ).toThrow(/dry run/);
  });

  test("wants exactly one creative shape", () => {
    expect(() =>
      assertLinkedInAdPayload(
        fresh({ video: { url: "https://cdn.example.com/clip.mp4" } }),
        account,
      ),
    ).toThrow(/exactly one/);
    expect(() =>
      assertLinkedInAdPayload(fresh({ imageUrl: undefined }), account),
    ).toThrow(/exactly one/);
  });

  test("ties goals to what the creative can do", () => {
    expect(() =>
      assertLinkedInAdPayload(fresh({ goal: "conversions" }), account),
    ).toThrow(/not conversions/);
    expect(() =>
      assertLinkedInAdPayload(fresh({ linkUrl: undefined }), account),
    ).toThrow(/link URL/);
    expect(() =>
      assertLinkedInAdPayload(fresh({ goal: "video_views" }), account),
    ).toThrow(/video creative/);
    expect(() =>
      assertLinkedInAdPayload(
        fresh({
          goal: "video_views",
          imageUrl: undefined,
          video: { url: "https://cdn.example.com/clip.mp4" },
        }),
        account,
      ),
    ).not.toThrow();
  });

  test("checks carousel cards and their landing pages", () => {
    const carousel = (
      cards: Array<{ imageUrl: string; landingUrl?: string }>,
    ) =>
      fresh({
        imageUrl: undefined,
        platformSpecificData: { carousel: { cards } },
      });
    expect(() =>
      assertLinkedInAdPayload(
        carousel([{ imageUrl: "https://cdn.example.com/a.jpg" }]),
        account,
      ),
    ).toThrow(/2–10 cards/);
    expect(() =>
      assertLinkedInAdPayload(
        {
          ...carousel([
            { imageUrl: "https://cdn.example.com/a.jpg" },
            { imageUrl: "https://cdn.example.com/b.jpg" },
          ]),
          linkUrl: undefined,
          goal: "engagement",
        },
        account,
      ),
    ).toThrow(/landing URL/);
    expect(() =>
      assertLinkedInAdPayload(
        carousel([
          { imageUrl: "https://cdn.example.com/a.jpg" },
          { imageUrl: "https://cdn.example.com/b.jpg" },
        ]),
        account,
      ),
    ).not.toThrow();
  });

  test("a manual bid needs its cost type, and the CTA must be LinkedIn's", () => {
    expect(() =>
      assertLinkedInAdPayload(
        fresh({ platformSpecificData: { unitCost: 2.5 } }),
        account,
      ),
    ).toThrow(/costType/);
    expect(() =>
      assertLinkedInAdPayload(
        fresh({ platformSpecificData: { costType: "CPC", unitCost: 2.5 } }),
        account,
      ),
    ).not.toThrow();
    expect(() =>
      assertLinkedInAdPayload(fresh({ callToAction: "SEE_DETAILS" }), account),
    ).toThrow(/call to action/);
  });

  test("an attach inherits everything the campaign owns", () => {
    expect(() => assertLinkedInAdPayload(attach(), account)).not.toThrow();
    expect(() =>
      assertLinkedInAdPayload(attach({ budgetAmount: 20 }), account),
    ).toThrow(/must not be resent/);
    expect(() =>
      assertLinkedInAdPayload(
        attach({ targeting: { countries: ["US"] } }),
        account,
      ),
    ).toThrow(/must not be resent/);
    expect(() =>
      assertLinkedInAdPayload(
        attach({ platformSpecificData: { costType: "CPM" } }),
        account,
      ),
    ).toThrow(/must not be resent/);
  });
});
