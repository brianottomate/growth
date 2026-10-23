import { describe, expect, it } from "bun:test";
import { growthActionPolicies } from "@/server/ai/kernel/policy";

// Actions that start spend or destroy what ran need a person's yes in the
// in-app chat (its approval card). MCP runs them without asking, and
// invoke-growth has no way to ask, so it never gets them.
const adsWrite = growthActionPolicies.adsWrite;
const NEEDS_A_YES = [
  "setDelivery",
  "publishAdditions",
  "boostMetaPost",
  "deletePlatformCampaign",
  "deleteCampaignLeavingPlatform",
  "deleteAdDraft",
  "removePlatformAd",
] as const satisfies readonly (keyof typeof adsWrite)[];

describe("ads action policy", () => {
  for (const action of NEEDS_A_YES)
    it(`${action} needs a person's yes`, () => {
      expect(adsWrite[action].approval).toBe("user");
      expect(adsWrite[action].surfaces).not.toContain("invoke-growth");
    });
});
