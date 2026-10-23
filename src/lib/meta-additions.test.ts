import { observedMetaPlacements } from "./meta-placement-plan";
import { expect, test } from "bun:test";
import { metaScheduleIssue } from "./meta-schedule";
import {
  metaAdSetAdditionControls,
  metaCampaignBudgetType,
} from "./meta-additions";

test("an addition into a running CBO campaign never rewrites or duplicates its budget", () => {
  const payload = metaAdSetAdditionControls({
    campaignId: "existing",
    campaignBudgeted: true,
    budget: 83,
    budgetType: "daily",
  });
  expect(payload).toEqual({ existingCampaignId: "existing", status: "PAUSED" });
});
test("ABO does not silently reuse a whole campaign budget for a new ad set", () => {
  expect(() =>
    metaAdSetAdditionControls({
      campaignId: "existing",
      campaignBudgeted: false,
      budget: null,
      budgetType: "daily",
    }),
  ).toThrow("explicit");
  expect(
    metaAdSetAdditionControls({
      campaignId: "existing",
      campaignBudgeted: false,
      budget: 41,
      budgetType: "daily",
    }),
  ).toEqual({
    existingCampaignId: "existing",
    budgetAmount: 41,
    budgetType: "daily",
    status: "PAUSED",
  });
});

test("incremental creative keeps explicit live placements and refuses unsupported inventory", () => {
  expect(
    observedMetaPlacements({
      publisher_platforms: ["facebook", "instagram"],
      facebook_positions: ["feed", "story"],
      instagram_positions: ["stream", "reels"],
    }),
  ).toEqual([
    "facebook-feed",
    "facebook-story",
    "instagram-feed",
    "instagram-reel",
  ]);
  expect(() =>
    observedMetaPlacements({
      publisher_platforms: ["audience_network"],
      audience_network_positions: ["classic"],
    }),
  ).toThrow("Unsupported");
});

test("a live lifetime CBO budget requires an end date before adding a set", () => {
  const budgetType = metaCampaignBudgetType({
    daily_budget: "0",
    lifetime_budget: "250000",
  });
  expect(budgetType).toBe("lifetime");
  expect(
    metaScheduleIssue({ startAt: null, endAt: null }, budgetType),
  ).toContain("end date");
  expect(
    metaCampaignBudgetType({ daily_budget: "8300", lifetime_budget: "0" }),
  ).toBe("daily");
  expect(metaCampaignBudgetType({})).toBeNull();
});
