import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import {
  approvalHasExpired,
  isApprovalDenial,
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

test("expired actions may be denied, while mixed or approved responses still require a fresh approval", () => {
  const denial = {
    id: "m",
    role: "assistant",
    parts: [
      {
        type: "tool-adsWrite__push",
        toolCallId: "c",
        state: "approval-responded",
        input: { campaignId: "x" },
        approval: { id: "a", approved: false },
      },
    ],
  } as UIMessage;
  expect(isApprovalDenial(denial)).toBe(true);
  expect(
    isApprovalDenial({
      ...denial,
      parts: [
        {
          ...denial.parts[0],
          approval: { id: "a", approved: true },
        } as UIMessage["parts"][number],
      ],
    }),
  ).toBe(false);
  expect(isApprovalDenial({ id: "m", role: "assistant", parts: [] })).toBe(
    false,
  );
});
