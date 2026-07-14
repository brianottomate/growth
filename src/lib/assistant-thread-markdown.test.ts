import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import { assistantThreadAsMarkdown } from "./assistant-thread-markdown";

describe("assistantThreadAsMarkdown", () => {
  test("exports readable text plus tool activity and the durable thread id", () => {
    const messages = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "How are we doing?" }],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-workspaceOverview",
            toolCallId: "call_1",
            state: "output-available",
            input: {},
            output: { content: 21 },
          },
          { type: "text", text: "One item needs attention." },
        ],
      },
    ] as UIMessage[];

    const markdown = assistantThreadAsMarkdown({
      threadId: "ath_example",
      title: "Morning review",
      messages,
    });

    expect(markdown.includes("# Morning review")).toBe(true);
    expect(markdown.includes("Thread ID: `ath_example`")).toBe(true);
    expect(markdown.includes("## You\n\nHow are we doing?")).toBe(true);
    expect(
      markdown.includes("Tool: workspaceOverview · output-available"),
    ).toBe(true);
    expect(markdown.includes('"content": 21')).toBe(true);
    expect(markdown.includes("One item needs attention.")).toBe(true);
  });
});
