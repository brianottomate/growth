import { expect, test } from "bun:test";
import { tool, type UIMessage } from "ai";
import { z } from "zod";
import { createChatToolScope } from "./chat-tool-scope";

const tools = {
  presentCopyOptions: tool({ inputSchema: z.object({}) }),
  performanceWrite__saveHomeGroup: tool({ inputSchema: z.object({}) }),
  performanceWrite__changeHomeGroupHomes: tool({ inputSchema: z.object({}) }),
  adsWrite__saveIdea: tool({ inputSchema: z.object({}) }),
  emailWrite__create: tool({ inputSchema: z.object({}) }),
};
const continuation: UIMessage = {
  id: "follow-up",
  role: "user",
  parts: [{ type: "text", text: "Make an extra group with two homes" }],
};
const enabled: UIMessage = {
  id: "previous-reply",
  role: "assistant",
  parts: [
    {
      type: "tool-selectToolDomain",
      toolCallId: "enable-performance",
      state: "output-available",
      input: { domain: "performance" },
      output: { enabled: "performance", note: "Use toolSearch" },
    },
  ],
};

test("a follow-up retains an explicitly enabled domain, including a focused chat", () => {
  for (const focus of [undefined, "creative"] as const) {
    const scope = createChatToolScope({
      tools,
      continuation,
      history: [enabled],
      focus,
    });
    expect(scope.activeTools()).toContain("presentCopyOptions");
    expect(scope.activeTools()).toContain("performanceWrite__saveHomeGroup");
    expect(scope.activeTools()).toContain(
      "performanceWrite__changeHomeGroupHomes",
    );
    expect(scope.activeTools()).not.toContain("emailWrite__create");
  }
});

test("unfinished domain calls do not enable tools on the next turn", () => {
  const unfinished: UIMessage = {
    ...enabled,
    parts: [
      {
        type: "tool-selectToolDomain",
        toolCallId: "enable-performance",
        state: "input-available",
        input: { domain: "performance" },
      },
    ],
  };
  const scope = createChatToolScope({
    tools,
    continuation,
    history: [unfinished],
  });
  expect(scope.activeTools()).not.toContain("performanceWrite__saveHomeGroup");
});
