import { compileMetaCampaignName } from "@/lib/performance-ads";
import type { CreateZernioStandaloneAdInput } from "@/server/clients/zernio.client";
import { describe, expect, it } from "bun:test";
import {
  assertMetaAdPayload,
  connectionRunsAsBrandPage,
  configuredMetaDestination,
  googlePauseOutcome,
  keepIncompletePush,
  metaPromotedObjectFor,
} from "@/server/services/ads-write.service";
import type { Ad, Campaign, PlatformCampaign } from "@/server/db/ads-schema";
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
  callToAction: "LEARN_MORE",
  budgetAmount: 50,
  budgetType: "daily",
  headline: "Spring",
  body: "Book direct.",
  linkUrl: "https://example.com",
  imageUrl: "https://cdn.example.com/a.jpg",
};
const account = {
  currency: "USD",
  minimumDailyBudget: 10,
};
describe("assertMetaAdPayload", () => {
  it("requires an end date for a lifetime budget", () => {
    expect(() =>
      assertMetaAdPayload(
        {
          ...base,
          budgetType: "lifetime",
        },
        account,
      ),
    ).toThrow(/endDate/);
    expect(() =>
      assertMetaAdPayload(
        {
          ...base,
          budgetType: "lifetime",
          endDate: "2026-09-30",
        },
        account,
      ),
    ).not.toThrow();
  });
  it("accepts a conversions goal backed by a custom conversion on its own, never beside a pixel", () => {
    expect(() =>
      assertMetaAdPayload(
        {
          ...base,
          goal: "conversions",
          promotedObject: {
            customConversionId: "cc_1",
          },
        },
        account,
      ),
    ).not.toThrow();
    // Live Meta answer (subcode 1885014) when both were sent for Winter Park Escapes.
    expect(() =>
      assertMetaAdPayload(
        {
          ...base,
          goal: "conversions",
          promotedObject: {
            pixelId: "px_1",
            customConversionId: "cc_1",
          },
        },
        account,
      ),
    ).toThrow(/without pixelId/);
    expect(() =>
      assertMetaAdPayload(
        {
          ...base,
          goal: "conversions",
        },
        account,
      ),
    ).toThrow(/pixelId/);
  });
  it("lets an ad set inherit its budget rather than restating it", () => {
    const { budgetAmount: _a, budgetType: _b, ...noBudget } = base;
    // Standalone: nothing owns the money, so this is a mistake.
    expect(() => assertMetaAdPayload(noBudget, account)).toThrow(
      /needs a budget/,
    );
    // Attaching to an existing ad set, and joining a CBO campaign, both have
    // an owner above them.
    expect(() =>
      assertMetaAdPayload(
        {
          ...noBudget,
          adSetId: "1202500",
        },
        account,
      ),
    ).not.toThrow();
    expect(() =>
      assertMetaAdPayload(
        {
          ...noBudget,
          existingCampaignId: "23850",
        },
        account,
      ),
    ).not.toThrow();
  });
  it("enforces the ad account's daily minimum", () => {
    expect(() =>
      assertMetaAdPayload(
        {
          ...base,
          budgetAmount: 5,
        },
        account,
      ),
    ).toThrow(/at least 10 USD/);
  });
});

/**
 * Google's create call has no paused option, so growth pauses in a second
 * call. If that call does not land, the row has to say so: a stored `paused`
 * over a delivering campaign is spend nobody is looking at.
 */
describe("googlePauseOutcome", () => {
  it("records live, with a warning, when there was no id to pause", () => {
    const outcome = googlePauseOutcome({
      paused: false,
      reason: "no-campaign-id",
    });
    expect(outcome.status).toBe("live");
    expect(outcome.warnings[0]).toMatch(/before it spends/);
  });
  it("carries the provider's reason out when the pause failed", () => {
    const outcome = googlePauseOutcome({
      paused: false,
      reason: "pause-failed",
      message: "429 rate limited",
    });
    expect(outcome.status).toBe("live");
    expect(outcome.warnings[0]).toContain("429 rate limited");
    expect(outcome.warnings[0]).toMatch(/pause it in Google Ads/);
  });
});

/**
 * Per-ad Page overrides must remain limited to verified connection grants.
 */
describe("connectionRunsAsBrandPage", () => {
  const winterPark = {
    metaPageId: "410431762630458",
  };
  it("refuses a connection bound to another Page", () => {
    expect(
      connectionRunsAsBrandPage(winterPark, {
        platformUserId: "27501783656071882:page:101399685529192",
      }),
    ).toBe(false);
  });
  it("allows a shared connection only for an explicitly granted brand Page", () => {
    const connection = {
      platformUserId: "27501783656071882:page:101399685529192",
    };
    expect(
      connectionRunsAsBrandPage(winterPark, connection, ["410431762630458"]),
    ).toBe(true);
    expect(
      connectionRunsAsBrandPage(winterPark, connection, ["1247371591803872"]),
    ).toBe(false);
  });
  it("refuses an unreadable identity rather than assuming", () => {
    expect(
      connectionRunsAsBrandPage(winterPark, {
        platformUserId: undefined,
      }),
    ).toBe(false);
  });
});
describe("what a Meta ad set optimises toward", () => {
  const client = {
    name: "Winter Park Escapes",
    relationship: "client" as const,
  };
  const purchase = {
    pixelId: "340252052212435",
    customEventType: "PURCHASE",
  };
  it("refuses a reporting conversion made for a previous website", () => {
    expect(() =>
      metaPromotedObjectFor({
        brand: client,
        meta: {
          ...purchase,
          conversionScope: "host",
        },
        reporting: {
          customConversionId: "cc_old",
          host: "old-site.com",
        },
        host: "winterparkescapes.com",
      }),
    ).toThrow(/Recreate/);
  });
});

/** Meta names classify client spend and must retain the operator's label. */
describe("Meta campaign label compilation", () => {
  it("retains custom labels under the correct spend prefix", () => {
    const input = {
      name: "VRMA: Booth #747 & Sahil talk",
      customer: "Wander",
      period: "202610",
    };
    expect(compileMetaCampaignName({ ...input, isClient: false })).toBe(
      "META_WANDER_SALES_PURCHASE_202610_vrma_booth_747_sahil_talk",
    );
    expect(
      compileMetaCampaignName({
        ...input,
        customer: "Porchlit Properties",
        isClient: true,
      }),
    ).toBe(
      "META_PERF+PORCHLIT+PROPERTIES_SALES_PURCHASE_202610_vrma_booth_747_sahil_talk",
    );
  });
  it("preserves legacy names and compiles the readable default without repeating the month", () => {
    const name =
      "META_PERF+PORCHLIT+PROPERTIES_SALES_PURCHASE_202610_tangy_cactus";
    const input = {
      customer: "Porchlit Properties",
      isClient: true,
      period: "202610",
    };
    expect(compileMetaCampaignName({ ...input, name })).toBe(name);
    expect(
      compileMetaCampaignName({
        ...input,
        name: "Sales · October 2026 · Tangy Cactus",
      }),
    ).toBe(name);
  });
});

describe("configured Meta destination", () => {
  it("requires a pinned connection even when a managing brand exists", () => {
    expect(() =>
      configuredMetaDestination({ adsConnectionBrandId: "brand_manager" }),
    ).toThrow(/brand settings/);
    expect(() => configuredMetaDestination(null)).toThrow(/brand settings/);
  });
  it("uses the exact saved credentials", () => {
    const destination = {
      connectionAccountId: "configured_connection",
      adAccountId: "act_configured",
    };
    expect(
      configuredMetaDestination({
        adsConnectionBrandId: "brand_manager",
        metaAdsDestination: destination,
      }),
    ).toEqual(destination);
  });
});

/**
 * A push that fails after the shell exists used to delete the campaign, which
 * hid the real platform error behind a cleanup. Now the shell and whatever ad
 * sets and ads were made are recorded as an incomplete push, and the error
 * says what exists and how to retry cleanly.
 */
describe("keepIncompletePush", () => {
  it("records the partial campaign as incomplete and names it in the error", async () => {
    const written: unknown[] = [];
    const ad = { id: "ad_1", name: "Lake house" } as Ad;
    const error = await keepIncompletePush(
      {
        platformName: "Meta",
        managedIn: "Ads Manager",
        stoppedAt: "creating ad set 2 of 2 (Families)",
        error: new Error("Hot Tubs has no access to pixel 340"),
        record: {
          adAccountId: "act_1",
          draft: {
            id: "pcamp_1",
            settings: { selectedAdIds: ["ad_1"] },
          } as PlatformCampaign,
          campaign: { id: "camp_1" } as Campaign,
          status: "paused",
          budgetAmount: 50,
          budgetType: "daily",
          externalCampaignId: "120200",
          heroThumbnailUrl: null,
          sets: [
            {
              audience: null,
              name: "Couples",
              externalId: "120201",
              targetingSpec: null,
              budget: null,
              budgetType: "daily",
              ads: [
                {
                  planAd: ad,
                  externalId: "120202",
                  headline: null,
                  body: null,
                  linkUrl: null,
                  media: null,
                },
              ],
            },
          ],
        },
      },
      async (record) => {
        written.push(record);
      },
    ).catch((caught: Error) => caught);

    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      externalCampaignId: "120200",
      sets: [{ externalId: "120201", ads: [{ externalId: "120202" }] }],
      incomplete: {
        stoppedAt: "creating ad set 2 of 2 (Families)",
        error: "Hot Tubs has no access to pixel 340",
      },
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("Hot Tubs has no access to pixel 340");
    expect(error.message).toContain(
      "Kept on Meta, paused: campaign 120200 with 1 ad set and 1 ad",
    );
    expect(error.message).toContain("deletePlatformCampaign");
  });
});
