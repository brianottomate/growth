import { describe, expect, test } from "bun:test";
import { pipelineStage } from "./performance-pipeline";

describe("Manual Performance pipeline", () => {
  test("an explicitly assigned stage wins over relationship defaults", () => {
    expect(
      pipelineStage({ relationship: "client", pipelineStage: "onboarding" }),
    ).toBe("onboarding");
    expect(
      pipelineStage({ relationship: "client", pipelineStage: "first_month" }),
    ).toBe("first_month");
  });
  test("legacy review stays pre-launch in onboarding", () => {
    expect(
      pipelineStage({ relationship: "client", pipelineStage: "review" }),
    ).toBe("onboarding");
  });
  test("unassigned records start at their relationship entry column", () => {
    expect(pipelineStage({ relationship: "client" })).toBe("signed");
    expect(pipelineStage({ relationship: "prospect" })).toBe("prospects");
  });
  test("campaign activity does not move an explicitly onboarding client", () => {
    const brand = {
      relationship: "client",
      pipelineStage: "onboarding" as const,
      delivery: "live",
      campaigns: [{ state: "live" }],
    };
    expect(pipelineStage(brand)).toBe("onboarding");
  });
  test("launch prep remains manual even with live delivery", () => {
    expect(
      pipelineStage({
        relationship: "client",
        pipelineStage: "launch_prep",
        delivery: "live",
      } as Parameters<typeof pipelineStage>[0]),
    ).toBe("launch_prep");
  });
});
