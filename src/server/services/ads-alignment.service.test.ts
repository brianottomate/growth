import { describe, expect, it } from "bun:test";

import type { Campaign, Initiative } from "@/server/db/schema";
import {
  diffInitiative,
  nameTokens,
  scoreSuggestion,
  windowsOverlap,
} from "./ads-alignment.core";

// Minimal fixture builders — only fields the diff reads, cast to full rows.
function initiative(overrides: Partial<Initiative> = {}): Initiative {
  return {
    id: "init_1",
    brandId: "brand_1",
    name: "Supply Push Q3",
    slug: "supply-push-q3",
    goal: "supply",
    landingUrl: null,
    description: null,
    color: null,
    status: "active",
    targetChannels: ["meta_ads", "google_ads"],
    budget: 10_000,
    startAt: new Date("2026-07-01"),
    endAt: new Date("2026-09-30"),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "camp_1",
    channelId: "chan_1",
    brandId: "brand_1",
    platform: "meta_ads",
    initiativeId: "init_1",
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

describe("nameTokens", () => {
  it("lowercases, splits on non-alphanumerics, drops short tokens, dedupes", () => {
    expect(nameTokens("Supply Push Q3", "supply-push-q3")).toEqual([
      "supply",
      "push",
    ]);
  });

  it("handles null/undefined parts", () => {
    expect(nameTokens(null, undefined, "")).toEqual([]);
  });
});

describe("windowsOverlap", () => {
  const d = (s: string) => new Date(s);

  it("overlapping windows", () => {
    expect(
      windowsOverlap(d("2026-07-01"), d("2026-09-30"), d("2026-08-01"), null),
    ).toBe(true);
  });

  it("disjoint windows", () => {
    expect(
      windowsOverlap(
        d("2026-07-01"),
        d("2026-09-30"),
        d("2026-10-01"),
        d("2026-12-01"),
      ),
    ).toBe(false);
  });

  it("fully open sides always overlap", () => {
    expect(windowsOverlap(null, null, null, null)).toBe(true);
  });
});

describe("scoreSuggestion", () => {
  it("rejects platforms outside targetChannels", () => {
    expect(
      scoreSuggestion(initiative(), campaign({ platform: "x_ads" })),
    ).toBeUndefined();
  });

  it("rejects non-overlapping date windows", () => {
    expect(
      scoreSuggestion(
        initiative(),
        campaign({
          startAt: new Date("2026-01-01"),
          endAt: new Date("2026-02-01"),
        }),
      ),
    ).toBeUndefined();
  });

  it("scores by token overlap", () => {
    expect(scoreSuggestion(initiative(), campaign())).toBe(1); // "supply"
    expect(
      scoreSuggestion(
        initiative(),
        campaign({ name: "SUPPLY push retargeting" }),
      ),
    ).toBe(2);
    expect(
      scoreSuggestion(initiative(), campaign({ name: "Brand awareness" })),
    ).toBe(0);
  });
});

describe("diffInitiative", () => {
  it("verdicts: ok / inactive / missing per intended channel", () => {
    const a = diffInitiative(
      initiative(),
      [
        campaign({ id: "c1", platform: "meta_ads", status: "live" }),
        campaign({ id: "c2", platform: "google_ads", status: "paused" }),
      ],
      [],
    );
    expect(a.channels.map((c) => [c.platform, c.verdict])).toEqual([
      ["meta_ads", "ok"],
      ["google_ads", "inactive"],
    ]);
  });

  it("missing channel when nothing is linked", () => {
    const a = diffInitiative(initiative(), [], []);
    expect(a.channels.map((c) => c.verdict)).toEqual(["missing", "missing"]);
  });

  it("flags unplanned platforms", () => {
    const a = diffInitiative(
      initiative(),
      [campaign({ platform: "x_ads", status: "live" })],
      [],
    );
    expect(a.unplanned).toHaveLength(1);
    expect(a.unplanned[0]?.platform).toBe("x_ads");
  });

  it("budget rollup prefers the precise stats snapshot and flags overrun", () => {
    const a = diffInitiative(
      initiative({ budget: 1_000 }),
      [
        campaign({ spend: 400, stats: { spend: 800.5 } }),
        campaign({ id: "c2", spend: 300, stats: null }),
      ],
      [],
    );
    expect(a.budget.linkedSpend).toBeCloseTo(1_100.5);
    expect(a.budget.overIntended).toBe(true);
    expect(a.budget.utilization).toBeCloseTo(1.1005);
  });

  it("no utilization without an intended budget", () => {
    const a = diffInitiative(initiative({ budget: null }), [campaign()], []);
    expect(a.budget.utilization).toBeUndefined();
    expect(a.budget.overIntended).toBe(false);
  });

  it("date drift: live campaigns ending after the initiative end", () => {
    const a = diffInitiative(
      initiative(),
      [
        campaign({ id: "runs-long", endAt: new Date("2026-12-01") }),
        campaign({
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
      campaign({ id: "s1", initiativeId: null, name: "Supply push exact" }),
      campaign({
        id: "s2",
        initiativeId: null,
        name: "Supply only",
        stats: { spend: 9_999 },
      }),
      campaign({ id: "s3", initiativeId: null, name: "Unrelated name" }),
      campaign({ id: "off-platform", initiativeId: null, platform: "x_ads" }),
    ];
    const a = diffInitiative(initiative(), [], candidates);
    expect(a.suggestions.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(a.suggestions[0]?.score).toBe(2);
  });
});
