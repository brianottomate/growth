import { describe, expect, test } from "bun:test";

import {
  adWriteIdempotencyKey,
  allowlistPlatform,
  campaignBusinessKey,
  googleCreativeRequirement,
  linkedInCreativeRequirement,
  linkedInDraftProviderControls,
  metaDraftProviderControls,
  metaCallToActionType,
  sameAdAccountId,
  zernioConnectionMatchesPlatform,
} from "./zernio-ads";

describe("Zernio ad account boundaries", () => {
  test("matches Meta account ids with or without act_", () => {
    expect(
      sameAdAccountId("meta", "act_885632589057558", "885632589057558"),
    ).toBe(true);
  });

  test("matches formatted Google customer ids to the allowlist form", () => {
    expect(sameAdAccountId("google", "325-444-9027", "3254449027")).toBe(true);
  });

  test("keeps Meta and Google connections explicit", () => {
    expect(zernioConnectionMatchesPlatform("meta", "facebook")).toBe(true);
    expect(zernioConnectionMatchesPlatform("meta", "meta_ads")).toBe(true);
    expect(zernioConnectionMatchesPlatform("google", "googleads")).toBe(true);
    expect(zernioConnectionMatchesPlatform("google", "youtube")).toBe(false);
    expect(allowlistPlatform("meta")).toBe("facebook");
    expect(allowlistPlatform("google")).toBe("google");
  });

  test("forces every Meta standalone tree to stay paused", () => {
    expect(metaDraftProviderControls(false)).toEqual({
      status: "PAUSED",
      validateOnly: false,
    });
    expect(metaDraftProviderControls(true)).toEqual({
      status: "PAUSED",
      validateOnly: true,
    });
  });

  test("enforces the platform-specific Google creative requirements", () => {
    expect(googleCreativeRequirement({ campaignType: "search" })).toContain(
      "keyword",
    );
    expect(googleCreativeRequirement({ campaignType: "display" })).toContain(
      "landscape and square",
    );
    expect(
      googleCreativeRequirement({
        campaignType: "search",
        keywords: ["luxury vacation rentals"],
      }),
    ).toBeNull();
    expect(
      googleCreativeRequirement({
        campaignType: "display",
        images: {
          landscape: "https://example.com/landscape.jpg",
          square: "https://example.com/square.jpg",
        },
      }),
    ).toBeNull();
  });
});

describe("LinkedIn boundaries", () => {
  test("matches sponsored accounts by number or URN", () => {
    expect(
      sameAdAccountId(
        "linkedin",
        "urn:li:sponsoredAccount:515601419",
        "515601419",
      ),
    ).toBe(true);
    expect(sameAdAccountId("linkedin", "515601419", "517256407")).toBe(false);
  });

  test("keeps the ads connection apart from the Company Page connection", () => {
    expect(zernioConnectionMatchesPlatform("linkedin", "linkedinads")).toBe(
      true,
    );
    expect(zernioConnectionMatchesPlatform("linkedin", "linkedin_ads")).toBe(
      true,
    );
    expect(zernioConnectionMatchesPlatform("linkedin", "linkedin")).toBe(false);
    expect(allowlistPlatform("linkedin")).toBe("linkedin");
  });

  test("pauses the whole hierarchy and never asks for a dry run", () => {
    expect(linkedInDraftProviderControls()).toEqual({ status: "PAUSED" });
  });

  test("states what a from-scratch LinkedIn campaign cannot be", () => {
    expect(
      linkedInCreativeRequirement({ goal: "conversions", hasVideo: false }),
    ).toContain("boosted");
    expect(
      linkedInCreativeRequirement({ goal: "video_views", hasVideo: false }),
    ).toContain("video");
    expect(
      linkedInCreativeRequirement({ goal: "traffic", hasVideo: false }),
    ).toContain("link URL");
    expect(
      linkedInCreativeRequirement({
        goal: "traffic",
        hasVideo: false,
        linkUrl: "https://wander.com",
      }),
    ).toBeNull();
    expect(
      linkedInCreativeRequirement({ goal: "engagement", hasVideo: false }),
    ).toBeNull();
  });
});

describe("provider-write idempotency", () => {
  const payloadHash = "a".repeat(24);

  test("a business key survives a different run, so a re-run cannot double-create", () => {
    const first = adWriteIdempotencyKey({
      action: "create-meta",
      runId: "run_1",
      payloadHash,
      businessKey: "deal_9:pm_4:catalog_sales",
    });
    const second = adWriteIdempotencyKey({
      action: "create-meta",
      runId: "run_2",
      payloadHash,
      businessKey: "deal_9:pm_4:catalog_sales",
    });
    expect(first).toBe(second);
  });

  test("a business key ignores payload drift, so a corrected budget replays the original create", () => {
    const base = {
      action: "create-meta",
      runId: "run_1",
      businessKey: "deal_9:pm_4:catalog_sales",
    };
    expect(
      adWriteIdempotencyKey({ ...base, payloadHash: "b".repeat(24) }),
    ).toBe(adWriteIdempotencyKey({ ...base, payloadHash: "c".repeat(24) }));
  });

  test("campaign type separates keys for the same deal and PM", () => {
    const catalog = adWriteIdempotencyKey({
      action: "create-meta",
      runId: "run_1",
      payloadHash,
      businessKey: campaignBusinessKey({
        dealId: "deal_9",
        pmId: "pm_4",
        campaignType: "catalog_sales",
      }),
    });
    const traffic = adWriteIdempotencyKey({
      action: "create-meta",
      runId: "run_1",
      payloadHash,
      businessKey: campaignBusinessKey({
        dealId: "deal_9",
        pmId: "pm_4",
        campaignType: "traffic",
      }),
    });
    expect(catalog).not.toBe(traffic);
  });

  test("without a business key the key stays run-scoped and payload-sensitive", () => {
    const first = adWriteIdempotencyKey({
      action: "create-meta",
      runId: "run_1",
      payloadHash,
    });
    expect(first).toBe(`growth:run:run_1:create-meta:${payloadHash}`);
    expect(
      adWriteIdempotencyKey({
        action: "create-meta",
        runId: "run_2",
        payloadHash,
      }),
    ).not.toBe(first);
  });

  test("business keys normalize casing and whitespace across surfaces", () => {
    expect(
      campaignBusinessKey({
        dealId: " Deal_9 ",
        pmId: "PM_4",
        campaignType: "Catalog_Sales",
      }),
    ).toBe("deal_9:pm_4:catalog_sales");
  });
});

test("Meta uses Book now by default and respects the selected CTA", () => {
  expect(metaCallToActionType()).toBe("BOOK_TRAVEL");
  expect(metaCallToActionType(null)).toBe("BOOK_TRAVEL");
  expect(metaCallToActionType(" ")).toBe("BOOK_TRAVEL");
  expect(metaCallToActionType("BOOK_NOW")).toBe("BOOK_TRAVEL");
  expect(metaCallToActionType("Book now")).toBe("BOOK_TRAVEL");
  expect(metaCallToActionType("Learn more")).toBe("LEARN_MORE");
  expect(metaCallToActionType("LEARN_MORE")).toBe("LEARN_MORE");
  expect(metaCallToActionType("CONTACT_US")).toBe("CONTACT_US");
});
