import { describe, expect, test } from "bun:test";

import {
  allowlistPlatform,
  googleCreativeRequirement,
  metaDraftProviderControls,
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
