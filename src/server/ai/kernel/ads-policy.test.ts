import { describe, expect, it } from "bun:test";

import { growthActionPolicies } from "@/server/ai/kernel/policy";

/**
 * Ads actions can move a client's money. These pin the boundaries that keep
 * that deliberate: which actions need an operator to approve, and which are
 * kept off the MCP surface because the direct projection executes tools
 * without the approval continuation the in-app card provides.
 */
const adsWrite = growthActionPolicies.adsWrite;
type AdsWriteAction = keyof typeof adsWrite;

/** Everything that reaches a provider in a way that can create or move spend. */
const SPEND_CAPABLE = [
  "push",
  "setDelivery",
  "deletePlatformCampaign",
  "createMetaDraft",
  "createGoogle",
  "boostMetaPost",
  "duplicateMetaCampaign",
] as const satisfies readonly AdsWriteAction[];

/** Local rows only: safe to expose everywhere, including MCP. */
const LOCAL_ONLY = [
  "draftCampaign",
  "draftAd",
  "addAudience",
  "setCreativePool",
  "setPlatformDraft",
  "attachCampaign",
  "deleteCampaignDraft",
  "deleteAudience",
  "deleteAdDraft",
] as const satisfies readonly AdsWriteAction[];

describe("ads action policy", () => {
  for (const action of SPEND_CAPABLE) {
    it(`${action} requires operator approval and stays off MCP`, () => {
      expect(adsWrite[action].approval).toBe("user");
      expect(adsWrite[action].surfaces).not.toContain("mcp");
    });
  }

  for (const action of LOCAL_ONLY) {
    it(`${action} stays a local write needing no approval`, () => {
      expect(adsWrite[action].consequence).toBe("local-write");
      expect(adsWrite[action].approval).toBe("none");
    });
  }

  it("deleting a live campaign is irreversible, unlike pausing it", () => {
    expect(adsWrite.deletePlatformCampaign.reversible).toBe(false);
    expect(adsWrite.setDelivery.reversible).toBe(true);
    expect(adsWrite.setDelivery.undoWith).toBe("adsWrite.setDelivery");
  });

  it("pushing creates paused, so the push itself cannot start spend", () => {
    // If this ever needs `approval` relaxed, the push has stopped being the
    // safe half of the pair and setDelivery is no longer the only spend gate.
    expect(adsWrite.push.undoWith).toBe("adsWrite.deletePlatformCampaign");
    expect(adsWrite.push.idempotent).toBe(true);
  });

  it("reading a campaign needs no approval and reaches every surface", () => {
    expect(growthActionPolicies.adsRead.openCampaign.approval).toBe("none");
    expect(growthActionPolicies.adsRead.openCampaign.surfaces).toContain("mcp");
  });
});
