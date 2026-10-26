import { describe, expect, test } from "bun:test";
import { growthActionPolicies } from "./policy";

describe("email test-send policy", () => {
  test("keeps a real provider seed behind user approval", () => {
    const policy = growthActionPolicies.emailWrite.sendTest;
    expect(policy.approval).toBe("user");
    expect(policy.consequence).toBe("provider-write");
    expect(policy.idempotent).toBe(false);
    expect(policy.reversible).toBe(false);
    expect(policy.surfaces).toContain("mcp");
    expect(policy.surfaces).not.toContain("invoke-growth");
  });
});
