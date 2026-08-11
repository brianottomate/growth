import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import {
  approvalHasExpired,
  validateApprovalContinuation,
} from "./approval-continuation";

const pending = {
  id: "assistant-1",
  role: "assistant",
  parts: [
    { type: "step-start" },
    {
      type: "tool-publishingWrite",
      toolCallId: "call-1",
      state: "approval-requested",
      input: { action: "scheduleSocialPost", timeZone: "Europe/Oslo" },
      approval: { id: "approval-1" },
    },
  ],
} as UIMessage;

describe("validateApprovalContinuation", () => {
  test("accepts an approval response that changes only approval state", () => {
    const incoming = structuredClone(pending);
    const part = incoming.parts[1] as Record<string, unknown>;
    part.state = "approval-responded";
    part.approval = { id: "approval-1", approved: true };
    expect(validateApprovalContinuation(pending, incoming)).toBeNull();
  });

  test("rejects changed tool input", () => {
    const incoming = structuredClone(pending);
    const part = incoming.parts[1] as Record<string, unknown>;
    part.state = "approval-responded";
    part.approval = { id: "approval-1", approved: true };
    part.input = { action: "scheduleSocialPost", timeZone: "UTC" };
    expect(validateApprovalContinuation(pending, incoming)).toContain(
      "changed the requested action",
    );
  });
});

describe("approvalHasExpired", () => {
  test("expires after thirty minutes", () => {
    expect(
      approvalHasExpired({
        createdAt: new Date("2026-08-11T10:00:00Z"),
        now: new Date("2026-08-11T10:31:00Z"),
      }),
    ).toBe(true);
  });
});
