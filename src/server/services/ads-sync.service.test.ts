import { describe, expect, it } from "bun:test";

import { treeIsCompleteEnoughToReconcile } from "@/server/services/ads-sync.service";

/**
 * Reconciliation marks live campaigns as ended when they vanish from the ad
 * tree. That is only safe on a complete tree — every guard here stands
 * between a filtered sync and a client's running campaigns being marked dead.
 */
const complete = {
  filteredOut: 0,
  errorCount: 0,
  accountScoped: false,
  limit: null,
  sinceDays: null,
  minSpend: null,
  statuses: null,
};

describe("treeIsCompleteEnoughToReconcile", () => {
  it("reconciles only a clean, unfiltered sync", () => {
    expect(treeIsCompleteEnoughToReconcile(complete)).toBe(true);
  });

  it.each([
    ["a campaign the window dropped", { filteredOut: 1 }],
    ["an error mid-sync", { errorCount: 1 }],
    ["a sync narrowed to one ad account", { accountScoped: true }],
    ["a page limit", { limit: 100 }],
    ["a date window", { sinceDays: 30 }],
    ["a spend floor", { minSpend: 10 }],
    ["a status filter", { statuses: ["active"] }],
  ])("refuses to reconcile after %s", (_label, override) => {
    expect(
      treeIsCompleteEnoughToReconcile({ ...complete, ...override }),
    ).toBe(false);
  });
});
