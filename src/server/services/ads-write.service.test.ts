import { describe, expect, it } from "bun:test";

import {
  assertMetaAdPayload,
  metaRequiresCampaignShell,
  estimateMonthlyKeywordCost,
  extractPreviewFrames,
  metaPageIdFromConnection,
  connectionRunsAsBrandPage,
  googlePauseOutcome,
  matchResponseAdsToPlan,
  metaPromotedObjectFor,
  tagMetaAdUtms,
  videoPayloadFor,
} from "@/server/services/ads-write.service";
import { withAdUtms } from "@/lib/ad-utm";
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
  callToAction: "LEARN_MORE",
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

describe("withAdUtms", () => {
  const utms = {
    source: "facebook",
    medium: "paid_social",
    campaign: "spring_2026",
    content: "roam_river",
  };

  it("appends the campaign utm params to a bare url", () => {
    const u = new URL(withAdUtms("https://winterparkescapes.com/", utms)!);
    expect(u.searchParams.get("utm_source")).toBe("facebook");
    expect(u.searchParams.get("utm_medium")).toBe("paid_social");
    expect(u.searchParams.get("utm_campaign")).toBe("spring_2026");
    expect(u.searchParams.get("utm_content")).toBe("roam_river");
  });

  it("never clobbers a utm an operator already set", () => {
    const u = new URL(
      withAdUtms("https://winterparkescapes.com/?utm_campaign=kept", utms)!,
    );
    expect(u.searchParams.get("utm_campaign")).toBe("kept");
    expect(u.searchParams.get("utm_source")).toBe("facebook");
  });

  it("preserves unrelated existing query params", () => {
    const u = new URL(withAdUtms("https://example.com/?key=wanderplus", utms)!);
    expect(u.searchParams.get("key")).toBe("wanderplus");
    expect(u.searchParams.get("utm_source")).toBe("facebook");
  });

  it("no-ops on a missing or non-absolute link", () => {
    expect(withAdUtms(undefined, utms)).toBeUndefined();
    expect(withAdUtms(null, utms)).toBeUndefined();
    expect(withAdUtms("/relative/path", utms)).toBe("/relative/path");
  });
});

describe("tagMetaAdUtms", () => {
  it("tags the ad-level link with campaign name and ad name", () => {
    const out = tagMetaAdUtms({
      ...base,
      campaignName: "META_PERF+_WPE_202609",
      adName: "static_roam_river",
      linkUrl: "https://winterparkescapes.com/",
    });
    const u = new URL(out.linkUrl!);
    expect(u.searchParams.get("utm_source")).toBe("facebook");
    expect(u.searchParams.get("utm_medium")).toBe("paid_social");
    expect(u.searchParams.get("utm_campaign")).toBe("META_PERF+_WPE_202609");
    expect(u.searchParams.get("utm_content")).toBe("static_roam_river");
  });

  it("falls back to the ad name when campaignName/adName are absent", () => {
    const out = tagMetaAdUtms({ ...base, linkUrl: "https://x.com/" });
    const u = new URL(out.linkUrl!);
    expect(u.searchParams.get("utm_campaign")).toBe(base.name);
    expect(u.searchParams.get("utm_content")).toBe(base.name);
  });

  it("tags carousel cards by headline and leaves link-less cards to inherit", () => {
    const out = tagMetaAdUtms({
      ...base,
      campaignName: "camp",
      linkUrl: "https://winterparkescapes.com/",
      imageUrl: undefined,
      carouselCards: [
        {
          imageUrl: "https://cdn/x.jpg",
          headline: "Roam River",
          linkUrl: "https://winterparkescapes.com/roam",
        },
        { imageUrl: "https://cdn/y.jpg", headline: "No Link" },
      ],
    });
    const card0 = new URL(out.carouselCards![0]!.linkUrl!);
    expect(card0.searchParams.get("utm_content")).toBe("Roam River");
    expect(card0.searchParams.get("utm_campaign")).toBe("camp");
    // No own link → stays undefined so it inherits the tagged ad-level link.
    expect(out.carouselCards![1]!.linkUrl).toBeUndefined();
  });

  it("tags each multi-creative link by creative name", () => {
    const out = tagMetaAdUtms({
      ...base,
      imageUrl: undefined,
      creatives: [
        {
          name: "cr_a",
          headline: "A",
          body: "b",
          linkUrl: "https://winterparkescapes.com/a",
        },
      ],
    });
    const u = new URL(out.creatives![0]!.linkUrl!);
    expect(u.searchParams.get("utm_content")).toBe("cr_a");
  });
});

describe("assertMetaAdPayload", () => {
  it("accepts a minimal single-creative ad", () => {
    expect(() => assertMetaAdPayload(base, account)).not.toThrow();
  });

  it("requires a call to action, which Zernio rejects a Meta ad without", () => {
    expect(() =>
      assertMetaAdPayload({ ...base, callToAction: undefined }, account),
    ).toThrow(/callToAction/);
    // The attach shape inherits the ad set's button.
    expect(() =>
      assertMetaAdPayload(
        { ...base, callToAction: undefined, adSetId: "set_1" },
        account,
      ),
    ).not.toThrow();
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
    ).toThrow(/image, a video, a carousel, or a creatives array/);
  });

  it("accepts a conversions goal backed by a custom conversion on its own, never beside a pixel", () => {
    expect(() =>
      assertMetaAdPayload(
        {
          ...base,
          goal: "conversions",
          promotedObject: { customConversionId: "cc_1" },
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
          promotedObject: { pixelId: "px_1", customConversionId: "cc_1" },
        },
        account,
      ),
    ).toThrow(/without pixelId/);
    expect(() =>
      assertMetaAdPayload({ ...base, goal: "conversions" }, account),
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
      assertMetaAdPayload({ ...noBudget, adSetId: "1202500" }, account),
    ).not.toThrow();
    expect(() =>
      assertMetaAdPayload(
        { ...noBudget, existingCampaignId: "23850" },
        account,
      ),
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
describe("assertMetaAdPayload video rules", () => {
  it("accepts a top-level video as its own creative shape", () => {
    expect(() =>
      assertMetaAdPayload(
        {
          ...base,
          imageUrl: undefined,
          video: {
            url: "https://cdn.example.com/a.mp4",
            thumbnailUrl: "https://cdn.example.com/a.jpg",
          },
        },
        account,
      ),
    ).not.toThrow();
  });

  it("rejects a creative carrying both an image and a video", () => {
    expect(() =>
      assertMetaAdPayload(
        {
          ...base,
          imageUrl: undefined,
          creatives: [
            {
              ...creative,
              video: {
                url: "https://cdn.example.com/a.mp4",
                thumbnailUrl: "https://cdn.example.com/a.jpg",
              },
            },
          ],
        },
        account,
      ),
    ).toThrow(/exactly one of imageUrl or video/);
  });

  it("requires the still thumbnail on a video creative", () => {
    expect(() =>
      assertMetaAdPayload(
        {
          ...base,
          imageUrl: undefined,
          creatives: [
            {
              name: "v",
              headline: "V",
              body: "clip",
              video: { url: "https://cdn.example.com/a.mp4" },
            },
          ],
        },
        account,
      ),
    ).toThrow(/thumbnailUrl is required/);
  });
});

describe("videoPayloadFor", () => {
  const content = (media: { url: string; thumbnail?: string }) => ({
    headline: "V",
    body: "clip",
    media: [{ ...media, type: "video" as const }],
  });

  it("compiles the clip plus its still", () => {
    expect(
      videoPayloadFor(
        "Concept A",
        content({
          url: "https://cdn.example.com/a.mp4",
          thumbnail: "https://cdn.example.com/a.mp4.thumb.webp",
        }),
      ),
    ).toEqual({
      url: "https://cdn.example.com/a.mp4",
      thumbnailUrl: "https://cdn.example.com/a.mp4.thumb.webp",
    });
  });

  it("refuses a clip with no still", () => {
    expect(() =>
      videoPayloadFor("Concept A", content({ url: "https://x.test/a.mp4" })),
    ).toThrow(/needs a still thumbnail/);
  });

  /**
   * A poster-less pick used to carry the clip's own url as its thumbnail, which
   * satisfies a presence check and is then rejected by Meta after the operator
   * has already approved the push.
   */
  it("refuses a clip standing in as its own still", () => {
    expect(() =>
      videoPayloadFor(
        "Concept A",
        content({
          url: "https://x.test/a.mp4",
          thumbnail: "https://x.test/a.mp4",
        }),
      ),
    ).toThrow(/needs a still thumbnail/);
  });
});

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
    expect(estimateMonthlyKeywordCost([row(1_000, null, 4)]).dollars).toBe(
      1_400,
    );
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

/**
 * Google's create call has no paused option, so growth pauses in a second
 * call. If that call does not land, the row has to say so: a stored `paused`
 * over a delivering campaign is spend nobody is looking at.
 */
describe("googlePauseOutcome", () => {
  it("records paused only when the pause actually landed", () => {
    expect(googlePauseOutcome({ paused: true })).toEqual({
      status: "paused",
      warnings: [],
    });
  });

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
 * The response-to-plan mapping is where a compile records lineage. Its
 * failure mode is stamping one externalId on several rows, which the unique
 * index rejects AFTER the campaign already exists on the platform.
 */
describe("matchResponseAdsToPlan", () => {
  const plan = (id: string, name: string) => ({ id, name });

  it("matches by exact name, out of order", () => {
    const out = matchResponseAdsToPlan(
      [
        { name: "B", platformAdId: "ext-b" },
        { name: "A", platformAdId: "ext-a" },
      ],
      [plan("ad_1", "A"), plan("ad_2", "B")],
    );
    expect(out.get("ad_1")).toBe("ext-a");
    expect(out.get("ad_2")).toBe("ext-b");
  });

  it("never assigns the same response ad twice", () => {
    const out = matchResponseAdsToPlan(
      [{ name: "A", platformAdId: "ext-a" }],
      [plan("ad_1", "A"), plan("ad_2", "A")],
    );
    expect(out.get("ad_1")).toBe("ext-a");
    expect(out.get("ad_2")).toBeNull();
  });

  it("single-to-single pairs even when names differ", () => {
    const out = matchResponseAdsToPlan(
      [{ name: "Meta renamed it", id: "ext-x" }],
      [plan("ad_1", "Our name")],
    );
    expect(out.get("ad_1")).toBe("ext-x");
  });

  it("one response and several plan ads does NOT fan the id out", () => {
    const out = matchResponseAdsToPlan(
      [{ name: "only", platformAdId: "ext-1" }],
      [plan("ad_1", "first"), plan("ad_2", "second")],
    );
    expect(out.get("ad_1")).toBeNull();
    expect(out.get("ad_2")).toBeNull();
  });

  it("unmatched plan ads map to null, not to a guess", () => {
    const out = matchResponseAdsToPlan(
      [
        { name: "A", platformAdId: "ext-a" },
        { name: "Z", platformAdId: "ext-z" },
      ],
      [plan("ad_1", "A"), plan("ad_2", "B")],
    );
    expect(out.get("ad_1")).toBe("ext-a");
    expect(out.get("ad_2")).toBeNull();
  });
});

/**
 * Meta's preview response shape is the part most likely to drift, so the
 * extractor is pure and shape-agnostic: any string carrying an iframe counts.
 */
describe("extractPreviewFrames", () => {
  it("finds iframes at any nesting and decodes the src", () => {
    const frames = extractPreviewFrames({
      previews: [
        {
          format: "DESKTOP_FEED_STANDARD",
          body: '<iframe src="https://www.facebook.com/ads/api/preview_iframe.php?d=abc&amp;t=1" width="500"></iframe>',
        },
      ],
      nested: {
        deep: ['<iframe src="https://fb.com/x?a=1&amp;b=2"></iframe>'],
      },
    });
    expect(frames).toHaveLength(2);
    expect(frames[0]?.src).toBe(
      "https://www.facebook.com/ads/api/preview_iframe.php?d=abc&t=1",
    );
    expect(frames[1]?.src).toBe("https://fb.com/x?a=1&b=2");
  });

  it("returns empty for a response with no iframes, never throws", () => {
    expect(extractPreviewFrames({ error: "nope" })).toEqual([]);
    expect(extractPreviewFrames(null)).toEqual([]);
    expect(extractPreviewFrames("plain text")).toEqual([]);
  });

  it("keeps an iframe with no src, flagged by the null", () => {
    const frames = extractPreviewFrames(["<iframe></iframe>"]);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.src).toBeNull();
  });
});

describe("metaPageIdFromConnection", () => {
  it("mines the page id out of Zernio's composite identity", () => {
    expect(
      metaPageIdFromConnection("27501783656071882:page:774615929078512"),
    ).toBe("774615929078512");
  });

  it("returns null rather than guessing when there is no page segment", () => {
    expect(metaPageIdFromConnection("27501783656071882")).toBeNull();
    expect(metaPageIdFromConnection(undefined)).toBeNull();
    expect(metaPageIdFromConnection(null)).toBeNull();
  });
});

/**
 * Per-ad Page overrides must remain limited to verified connection grants.
 */
describe("connectionRunsAsBrandPage", () => {
  const winterPark = { metaPageId: "410431762630458" };

  it("passes a connection bound to the brand's Page", () => {
    expect(
      connectionRunsAsBrandPage(winterPark, {
        platformUserId: "27501783656071882:page:410431762630458",
      }),
    ).toBe(true);
  });

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
      connectionRunsAsBrandPage(winterPark, { platformUserId: undefined }),
    ).toBe(false);
  });

  it("passes any connection while the brand has no Page bound", () => {
    expect(
      connectionRunsAsBrandPage(
        { metaPageId: null },
        { platformUserId: "27501783656071882:page:101399685529192" },
      ),
    ).toBe(true);
  });
});

describe("what a Meta ad set optimises toward", () => {
  const client = {
    name: "Winter Park Escapes",
    relationship: "client" as const,
    website: "https://www.winterparkescapes.com",
  };
  const purchase = { pixelId: "340252052212435", customEventType: "PURCHASE" };
  const neverCalled = async () => {
    throw new Error("must not provision");
  };

  it("scopes a client brand's purchase to its own host through a custom conversion", async () => {
    const calls: unknown[] = [];
    const warnings: string[] = [];
    const result = await metaPromotedObjectFor({
      brand: client,
      meta: purchase,
      validateOnly: false,
      ensureCustomConversion: async (input) => {
        calls.push(input);
        return { customConversionId: "cc_wpe", reused: true };
      },
      warnings,
    });

    expect(result).toEqual({ customConversionId: "cc_wpe" });
    expect(calls).toEqual([
      {
        name: "META_PERF+WINTER+PARK+ESCAPES_PURCHASE",
        pixelId: "340252052212435",
        customEventType: "PURCHASE",
        rule: { url: { i_contains: "winterparkescapes.com" } },
      },
    ]);
    expect(warnings).toEqual([
      "Meta optimises on META_PERF+WINTER+PARK+ESCAPES_PURCHASE (PURCHASE on winterparkescapes.com), reused as custom conversion cc_wpe",
    ]);
  });

  it("keeps Wander's own brands on the raw event", async () => {
    const result = await metaPromotedObjectFor({
      brand: {
        name: "Wander",
        relationship: "internal",
        website: "https://www.wander.com",
      },
      meta: purchase,
      validateOnly: false,
      ensureCustomConversion: neverCalled,
      warnings: [],
    });
    expect(result).toEqual(purchase);
  });

  it("falls back to the event, with a warning, when the client has no website to scope by", async () => {
    const warnings: string[] = [];
    const result = await metaPromotedObjectFor({
      brand: { ...client, website: null },
      meta: purchase,
      validateOnly: false,
      ensureCustomConversion: neverCalled,
      warnings,
    });
    expect(result).toEqual(purchase);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/no website/);
  });

  it("provisions nothing on a dry run", async () => {
    const result = await metaPromotedObjectFor({
      brand: client,
      meta: purchase,
      validateOnly: true,
      ensureCustomConversion: neverCalled,
      warnings: [],
    });
    expect(result).toEqual(purchase);
  });

  it("lets an explicit custom conversion in the settings win", async () => {
    const result = await metaPromotedObjectFor({
      brand: client,
      meta: { ...purchase, customConversionId: "cc_pinned" },
      validateOnly: false,
      ensureCustomConversion: neverCalled,
      warnings: [],
    });
    expect(result).toEqual({ customConversionId: "cc_pinned" });
  });

  it("sends no promoted object when the settings name neither a pixel nor an event", async () => {
    const result = await metaPromotedObjectFor({
      brand: client,
      meta: {},
      validateOnly: false,
      ensureCustomConversion: neverCalled,
      warnings: [],
    });
    expect(result).toBeUndefined();
  });
});

it("attaches a carousel to a conversion ad set without resending its pixel and budget", () => {
  const payload: CreateZernioStandaloneAdInput = {
    ...base,
    adSetId: "existing_set",
    goal: "conversions",
    budgetAmount: undefined,
    budgetType: undefined,
    imageUrl: undefined,
    carouselCards: [
      { imageUrl: "https://example.com/1.jpg" },
      { imageUrl: "https://example.com/2.jpg" },
    ],
  };
  expect(() => assertMetaAdPayload(payload, account)).not.toThrow();
  expect(() =>
    assertMetaAdPayload(
      { ...payload, adSetId: undefined, budgetAmount: 50 },
      account,
    ),
  ).toThrow(/pixelId/);
  expect(() =>
    assertMetaAdPayload(
      {
        ...payload,
        carouselCards: undefined,
        existingCreativeId: "creative_1",
      },
      account,
    ),
  ).not.toThrow();
});

it("keeps campaign budgets on the campaign with any audience count", () => {
  for (const count of [0, 1, 2])
    expect(metaRequiresCampaignShell(count, true)).toBe(true);
  expect(metaRequiresCampaignShell(1, false)).toBe(false);
  expect(metaRequiresCampaignShell(2, false)).toBe(true);
});
