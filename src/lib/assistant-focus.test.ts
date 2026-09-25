import { describe, expect, test } from "bun:test";
import { campaignFocusForTurn } from "./assistant-focus";
import type { AdCampaignWorkContext } from "./assistant-events";
import { assistantPageRoute } from "./assistant-page-route";
import { campaignPath } from "./campaign-navigation";

const saved: AdCampaignWorkContext = {
  type: "work_ad_campaign",
  brandId: "brand-a",
  brandName: "A",
  campaignId: "camp_a",
  campaignName: "A launch",
  adId: "ad_a",
};
const page: AdCampaignWorkContext = {
  type: "work_ad_campaign",
  brandId: "brand-b",
  brandName: "B",
  campaignId: "camp_b",
  campaignName: "B launch",
};

describe("assistant focus across client navigation", () => {
  test("following the new client's page drops the previous ad target", () => {
    expect(
      campaignFocusForTurn({ mode: "page", page, pinned: saved, saved }),
    ).toEqual(page);
  });
  test("a page without a campaign never revives a saved campaign", () => {
    expect(campaignFocusForTurn({ mode: "page", saved })).toBeUndefined();
  });
  test("pinning a brand or content item clears an older ad focus", () => {
    expect(campaignFocusForTurn({ mode: "pinned", saved })).toBeUndefined();
  });
  test("a deliberate pin stays selected while browsing another client", () => {
    expect(
      campaignFocusForTurn({ mode: "pinned", page, pinned: saved }),
    ).toEqual(saved);
  });
  test("an explicit new campaign intent takes precedence over the old pin", () => {
    expect(
      campaignFocusForTurn({ mode: "pinned", intent: page, saved }),
    ).toEqual(page);
  });
});

describe("campaign navigation", () => {
  test("both campaign routes and their by-home views identify the same record", () => {
    for (const workspace of ["brand", "performance"] as const) {
      const path = campaignPath("legacy-rnr", "camp_a", workspace);
      for (const suffix of ["", "/by-home?home=home_a"]) {
        expect(assistantPageRoute(path + suffix)).toMatchObject({
          brandSlug: "legacy-rnr",
          campaignId: "camp_a",
        });
      }
    }
  });
  test("platform campaign and list routes do not masquerade as authored campaigns", () => {
    expect(
      assistantPageRoute("/app/brands/legacy-rnr/ads/platform/pcamp_a")
        .campaignId,
    ).toBeUndefined();
    expect(
      assistantPageRoute("/app/performance/brands/legacy-rnr/campaigns")
        .campaignId,
    ).toBeUndefined();
  });
  test("home and billing deep links identify their own records", () => {
    expect(
      assistantPageRoute("/app/performance/brands/legacy-rnr/homes/home_a"),
    ).toMatchObject({ brandSlug: "legacy-rnr", homeId: "home_a" });
    expect(assistantPageRoute("/app/performance/perf_a").accountId).toBe(
      "perf_a",
    );
  });
});

import {
  catalogFocusForTurn,
  latestAssistantFocus,
  sameTurnFocus,
} from "./assistant-focus";
const home = {
  type: "work_catalog_home" as const,
  brandId: "brand-a",
  brandName: "A",
  homeId: "home-1",
  homeName: "Suite 302",
};
test("a cleared catalog focus survives persistence and ordinary follow-ups", () => {
  const messages: { role: string; metadata?: unknown }[] = JSON.parse(
    JSON.stringify([
      { role: "user", metadata: { catalogHomeContext: home } },
      {
        role: "user",
        metadata: { contextMode: "pinned", catalogHomeContext: null },
      },
      { role: "assistant", metadata: {} },
    ]),
  ) as { role: string; metadata?: unknown }[];
  const saved = latestAssistantFocus(messages);
  expect(saved?.catalogHomeContext).toBeNull();
  expect(
    catalogFocusForTurn({ saved: saved?.catalogHomeContext }),
  ).toBeUndefined();
});
test("switching intent or following the page ends catalog focus", () => {
  expect(
    catalogFocusForTurn({ mode: "page", saved: home, pinned: home }),
  ).toBeUndefined();
  expect(
    catalogFocusForTurn({
      intent: { ...page, visibleText: "Work on this" },
      saved: home,
    }),
  ).toBeUndefined();
  expect(catalogFocusForTurn({ mode: "pinned", saved: home })).toBeUndefined();
});
test("a correction may follow the selected home across navigation but cannot change homes", () => {
  const running = {
    assistantIntent: { ...home, focus: "photo", visibleText: "New photo" },
    pagePath: "/catalog",
  };
  expect(
    sameTurnFocus(running, {
      contextMode: "pinned",
      catalogContext: home,
      pagePath: "/elsewhere",
    }),
  ).toBe(true);
  expect(
    sameTurnFocus(running, {
      contextMode: "pinned",
      catalogContext: { ...home, homeId: "home-2" },
    }),
  ).toBe(false);
});
