import type { ModelMessage } from "ai";
import { describe, expect, test } from "bun:test";
import { generateText, tool, type UIMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import {
  approvalHasExpired,
  isApprovalDenial,
  validateApprovalContinuation,
  withRequestContext,
} from "./approval-continuation";
const pending = {
  id: "assistant-1",
  role: "assistant",
  parts: [
    {
      type: "step-start",
    },
    {
      type: "tool-publishingWrite",
      toolCallId: "call-1",
      state: "approval-requested",
      input: {
        action: "scheduleSocialPost",
        timeZone: "Europe/Oslo",
      },
      approval: {
        id: "approval-1",
      },
    },
  ],
} as UIMessage;
describe("validateApprovalContinuation", () => {
  test("accepts an approval response that changes only approval state", () => {
    const incoming = structuredClone(pending);
    const part = incoming.parts[1] as Record<string, unknown>;
    part.state = "approval-responded";
    part.approval = {
      id: "approval-1",
      approved: true,
    };
    expect(validateApprovalContinuation(pending, incoming)).toBeNull();
  });
  test("rejects changed tool input", () => {
    const incoming = structuredClone(pending);
    const part = incoming.parts[1] as Record<string, unknown>;
    part.state = "approval-responded";
    part.approval = {
      id: "approval-1",
      approved: true,
    };
    part.input = {
      action: "scheduleSocialPost",
      timeZone: "UTC",
    };
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
        input: {
          campaignId: "x",
        },
        approval: {
          id: "a",
          approved: false,
        },
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
          approval: {
            id: "a",
            approved: true,
          },
        } as UIMessage["parts"][number],
      ],
    }),
  ).toBe(false);
  expect(
    isApprovalDenial({
      id: "m",
      role: "assistant",
      parts: [],
    }),
  ).toBe(false);
});
describe("withRequestContext", () => {
  const sheet: ModelMessage = {
    role: "user",
    content: [
      {
        type: "text",
        text: "Current ad images.",
      },
    ],
  };
  const prompt: ModelMessage = {
    role: "user",
    content: "Reopen the ad",
  };
  const call: ModelMessage = {
    role: "assistant",
    content: [
      {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "setAdStatus",
        input: {
          status: "drawn",
        },
      },
      {
        type: "tool-approval-request",
        approvalId: "approval-1",
        toolCallId: "call-1",
      },
    ],
  };
  const approval: ModelMessage = {
    role: "tool",
    content: [
      {
        type: "tool-approval-response",
        approvalId: "approval-1",
        approved: true,
      },
    ],
  };
  test("keeps request context before the pending approval so the approved call executes", async () => {
    const run = async (messages: ModelMessage[]) => {
      let executed = false;
      const model = new MockLanguageModelV4({
        doGenerate: {
          content: [
            {
              type: "text",
              text: "Reopened.",
            },
          ],
          finishReason: {
            unified: "stop",
            raw: undefined,
          },
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: 1,
              text: 1,
              reasoning: undefined,
            },
          },
          warnings: [],
        },
      });
      await generateText({
        model,
        messages,
        tools: {
          setAdStatus: tool({
            inputSchema: z.object({
              status: z.string(),
            }),
            execute: async () => {
              executed = true;
              return {
                status: "drawn",
              };
            },
          }),
        },
        toolApproval: () => "user-approval",
      });
      return executed;
    };
    let invalidContinuation: unknown;
    try {
      await run([prompt, call, approval, sheet]);
    } catch (error) {
      invalidContinuation = error;
    }
    expect(invalidContinuation).toMatchObject({
      name: "AI_MissingToolResultsError",
    });
    expect(
      await run(withRequestContext([prompt, call, approval], [sheet])),
    ).toBe(true);
  });
});
