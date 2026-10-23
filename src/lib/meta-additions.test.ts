import { observedMetaPlacements } from "./meta-placement-plan";
import { expect, test } from "bun:test";
import { metaAdSetAdditionControls } from "./meta-additions";

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
