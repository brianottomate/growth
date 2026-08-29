import { describe, expect, it } from "bun:test";

import type { PlatformCampaign, Campaign } from "@/server/db/schema";
import { diffCampaign, scoreSuggestion } from "./ads-alignment.service";

// Minimal fixture builders — only fields the diff reads, cast to full rows.
function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "camp_1",
    brandId: "brand_1",
    name: "Supply Push Q3",
    slug: "supply-push-q3",
    goal: "supply",
    landingUrl: null,
    description: null,
    color: null,
    status: "active",
    targetChannels: ["meta_ads", "google_ads"],
    creativePool: [],
    platformConfig: {},
    budget: 10_000,
    performanceCycleId: null,
    startAt: new Date("2026-07-01"),
    endAt: new Date("2026-09-30"),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function platformCampaign(
  overrides: Partial<PlatformCampaign> = {},
): PlatformCampaign {
  return {
    id: "pcamp_1",
    channelId: "chan_1",
    brandId: "brand_1",
    platform: "meta_ads",
    campaignId: "camp_1",
    name: "Prospecting Supply Broad",
    status: "live",
    objective: null,
    startAt: new Date("2026-07-05"),
    endAt: null,
    budget: 4_000,
    spend: 1_200,
    adSpots: 0,
    stats: null,
    heroThumbnailUrl: null,
    externalId: null,
    manageUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("scoreSuggestion", () => {
  it("does not suggest a campaign on a channel outside the campaign", () => {
    expect(
      scoreSuggestion(campaign(), platformCampaign({ platform: "x_ads" })),
    ).toBeUndefined();
  });

  it("does not suggest a campaign that ran outside the campaign window", () => {
    expect(
      scoreSuggestion(campaign(),
        platformCampaign({
          startAt: new Date("2026-01-01"),
          endAt: new Date("2026-02-01"),
        }),
      ),
    ).toBeUndefined();
  });

  it("ranks eligible campaigns by meaningful campaign-name overlap", () => {
    expect(scoreSuggestion(campaign(), platformCampaign())).toBe(1); // "supply"
    expect(
      scoreSuggestion(campaign(),
        platformCampaign({ name: "SUPPLY push retargeting" }),
      ),
    ).toBe(2);
    expect(
      scoreSuggestion(campaign(), platformCampaign({ name: "Brand awareness" })),
    ).toBe(0);
  });

  it("keeps open-ended campaigns eligible when their active dates overlap", () => {
    expect(
      scoreSuggestion(campaign(),
        platformCampaign({
          name: "Supply expansion",
          startAt: new Date("2026-08-01"),
          endAt: null,
        }),
      ),
    ).toBe(1);
  });
});

describe("diffCampaign", () => {
  it("verdicts: ok / inactive / missing per intended channel", () => {
    const a = diffCampaign(campaign(),
      [
        platformCampaign({ id: "c1", platform: "meta_ads", status: "live" }),
        platformCampaign({ id: "c2", platform: "google_ads", status: "paused" }),
      ],
      [],
    );
    expect(a.channels.map((c) => [c.platform, c.verdict])).toEqual([
      ["meta_ads", "ok"],
      ["google_ads", "inactive"],
    ]);
  });

  it("missing channel when nothing is linked", () => {
    const a = diffCampaign(campaign(), [], []);
    expect(a.channels.map((c) => c.verdict)).toEqual(["missing", "missing"]);
  });

  it("flags unplanned platforms", () => {
    const a = diffCampaign(campaign(),
      [platformCampaign({ platform: "x_ads", status: "live" })],
      [],
    );
    expect(a.unplanned).toHaveLength(1);
    expect(a.unplanned[0]?.platform).toBe("x_ads");
  });

  it("budget rollup prefers the precise stats snapshot and flags overrun", () => {
    const a = diffCampaign(
      campaign({ budget: 1_000 }),
      [
        platformCampaign({ spend: 400, stats: { spend: 800.5 } }),
        platformCampaign({ id: "c2", spend: 300, stats: null }),
      ],
      [],
    );
    expect(a.budget.linkedSpend).toBeCloseTo(1_100.5);
    expect(a.budget.overIntended).toBe(true);
    expect(a.budget.utilization).toBeCloseTo(1.1005);
  });

  it("no utilization without an intended budget", () => {
    const a = diffCampaign(campaign({ budget: null }), [platformCampaign()], []);
    expect(a.budget.utilization).toBeUndefined();
    expect(a.budget.overIntended).toBe(false);
  });

  it("date drift: live campaigns ending after the campaign end", () => {
    const a = diffCampaign(campaign(),
      [
        platformCampaign({ id: "runs-long", endAt: new Date("2026-12-01") }),
        platformCampaign({
          id: "ended-late-but-paused",
          status: "paused",
          endAt: new Date("2026-12-01"),
        }),
      ],
      [],
    );
    expect(a.dateDrift.map((c) => c.id)).toEqual(["runs-long"]);
  });

  it("suggestions ranked by score then spend, capped at 10", () => {
    const candidates = [
      platformCampaign({ id: "s1", campaignId: null, name: "Supply push exact" }),
      platformCampaign({
        id: "s2",
        campaignId: null,
        name: "Supply only",
        stats: { spend: 9_999 },
      }),
      platformCampaign({ id: "s3", campaignId: null, name: "Unrelated name" }),
      platformCampaign({ id: "off-platform", campaignId: null, platform: "x_ads" }),
    ];
    const a = diffCampaign(campaign(), [], candidates);
    expect(a.suggestions.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(a.suggestions[0]?.score).toBe(2);
  });
});
