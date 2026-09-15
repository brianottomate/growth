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
    expect(treeIsCompleteEnoughToReconcile({ ...complete, ...override })).toBe(
      false,
    );
  });
});

import { campaignBelongsToBrand } from "@/server/services/ads-sync.service";

/**
 * One ad account can serve several brands. Attribution follows the rows that
 * already exist: a claimed campaign stays with its claimant, a borrowed
 * account yields only what was pushed for the borrower, and the owner keeps
 * the rest.
 */
describe("campaignBelongsToBrand", () => {
  const mine = new Set(["me"]);
  const theirs = new Set(["other"]);

  it("keeps a campaign the brand already claims, shared account or not", () => {
    expect(
      campaignBelongsToBrand({
        brandId: "me",
        accountShared: true,
        claimants: mine,
      }),
    ).toBe(true);
    expect(
      campaignBelongsToBrand({
        brandId: "me",
        accountShared: false,
        claimants: mine,
      }),
    ).toBe(true);
  });

  it("never takes a campaign another brand claims", () => {
    expect(
      campaignBelongsToBrand({
        brandId: "me",
        accountShared: false,
        claimants: theirs,
      }),
    ).toBe(false);
  });

  it("gives unclaimed campaigns to the owner only", () => {
    expect(
      campaignBelongsToBrand({
        brandId: "me",
        accountShared: false,
        claimants: undefined,
      }),
    ).toBe(true);
    expect(
      campaignBelongsToBrand({
        brandId: "me",
        accountShared: true,
        claimants: new Set(),
      }),
    ).toBe(false);
  });
});
