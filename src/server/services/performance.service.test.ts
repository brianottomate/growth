import { describe, expect, it } from "bun:test";

import { countDeliveryByCycle } from "./performance.service";

/**
 * The three delivery kinds come from three queries destructured in one
 * statement, each feeding a different tally. A rename once pointed the emails
 * tally at the ads array and typechecked, because every row is `{ cycleId }`.
 * These counts are what a customer's report is built from.
 */
describe("countDeliveryByCycle", () => {
  it("counts each kind from its own source", () => {
    const delivery = countDeliveryByCycle({
      campaigns: [{ cycleId: "a" }, { cycleId: "a" }, { cycleId: "b" }],
      lifecycleCampaigns: [{ cycleId: "a" }],
      amplifications: [{ cycleId: "b" }, { cycleId: "b" }],
    });

    expect(delivery.get("a")).toEqual({ ads: 2, emails: 1, influencers: 0 });
    expect(delivery.get("b")).toEqual({ ads: 1, emails: 0, influencers: 2 });
  });

  it("ignores rows attached to no cycle", () => {
    const delivery = countDeliveryByCycle({
      campaigns: [{ cycleId: null }],
      lifecycleCampaigns: [],
      amplifications: [],
    });

    expect(delivery.size).toBe(0);
  });
});
