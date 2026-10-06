import { describe, expect, it } from "bun:test";
import { growthActionPolicies } from "@/server/ai/kernel/policy";

// Actions that start spend or destroy what ran need a person's yes on every
// surface that can run them: the approval card in chat, an elicitation over
// MCP. invoke-growth has no way to ask, so it never gets them.
const adsWrite = growthActionPolicies.adsWrite;
const NEEDS_A_YES = [
  "setDelivery",
  "boostMetaPost",
  "deletePlatformCampaign",
  "deleteCampaignLeavingPlatform",
  "deleteAdDraft",
  "setAdStatus",
] as const satisfies readonly (keyof typeof adsWrite)[];

describe("ads action policy", () => {
  for (const action of NEEDS_A_YES)
    it(`${action} needs a person's yes`, () => {
      expect(adsWrite[action].approval).toBe("user");
      expect(adsWrite[action].surfaces).not.toContain("invoke-growth");
    });
});
