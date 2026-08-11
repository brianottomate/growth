import { describe, expect, test } from "bun:test";

import { isApprovalSuperseded } from "./chat-approval-state";

describe("isApprovalSuperseded", () => {
  test("supersedes an approval after the operator sends another message", () => {
    expect(
      isApprovalSuperseded(
        [{ role: "assistant" }, { role: "user" }, { role: "assistant" }],
        0,
      ),
    ).toBe(true);
  });

  test("keeps the latest approval actionable", () => {
    expect(
      isApprovalSuperseded([{ role: "user" }, { role: "assistant" }], 1),
    ).toBe(false);
  });
});
