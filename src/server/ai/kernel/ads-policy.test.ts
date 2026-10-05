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
  "createSpecializedMetaDraft",
  "boostMetaPost",
  "duplicateMetaCampaign",
] as const satisfies readonly AdsWriteAction[];

describe("ads action policy", () => {
  for (const action of SPEND_CAPABLE) {
    it(`${action} requires operator approval and stays off MCP`, () => {
      expect(adsWrite[action].approval).toBe("user");
      expect(adsWrite[action].surfaces).not.toContain("mcp");
    });
  }
  it("approving an ad is the operator's sign-off, not the model's", () => {
    // Approval is what the push requires, so a model approving its own ideas
    // would make the gate meaningless.
    expect(adsWrite.setAdStatus.approval).toBe("user");
    expect(adsWrite.setAdStatus.surfaces).not.toContain("mcp");
  });
});
