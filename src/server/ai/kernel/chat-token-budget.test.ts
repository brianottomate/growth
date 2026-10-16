import { expect, test } from "bun:test";
import { chatBudgetFetch, pruneProviderToolHistory } from "./chat-token-budget";
import { compactChatMessages, chatHistoryForModel } from "./chat-context";
import { growthActionPolicies } from "./policy";

test("large attachments do not discard live reasoning or gathered evidence", () => {
  const pdfMessage = {
    id: "pdf",
    role: "user" as const,
    parts: [
      {
        type: "file" as const,
        mediaType: "application/pdf",
        url: "data:application/pdf;base64,document",
      },
    ],
  };
  expect(chatHistoryForModel([pdfMessage])).toEqual([pdfMessage]);
  const messages = [
    {
      role: "user" as const,
      content: [
        {
          type: "file" as const,
          mediaType: "application/pdf",
          data: "x".repeat(2_100_000),
        },
      ],
    },
    {
      role: "assistant" as const,
      content: [
        { type: "reasoning" as const, text: "live reasoning" },
        {
          type: "tool-call" as const,
          toolName: "read",
          toolCallId: "facts",
          input: {},
        },
      ],
    },
    {
      role: "tool" as const,
      content: [
        {
          type: "tool-result" as const,
          toolName: "read",
          toolCallId: "facts",
          output: { type: "json" as const, value: { verifiedFigure: 12345 } },
        },
      ],
    },
    ...Array.from({ length: 8 }, () => ({
      role: "assistant" as const,
      content: "step",
    })),
  ];
  const compacted = JSON.stringify(compactChatMessages(messages));
  expect(compacted).toContain("verifiedFigure");
  expect(compacted).toContain("live reasoning");
  expect(compacted).toContain("x".repeat(2_100_000));
});

test("retirement keeps the prefix and the complete live turn, without fabricating success", () => {
  const body = {
    model: "test",
    max_tokens: 100,
    messages: [
      { role: "user" as const, content: "original instructions" },
      {
        role: "assistant" as const,
        content: [{ type: "tool_use", id: "old", name: "read" }],
      },
      {
        role: "user" as const,
        content: [
          {
            type: "tool_result",
            tool_use_id: "old",
            is_error: true,
            content: "failed",
          },
        ],
      },
      { role: "user" as const, content: "current task" },
      ...Array.from({ length: 5 }, (_, i) => [
        {
          role: "assistant" as const,
          content: [{ type: "tool_use", id: `live-${i}`, name: "read" }],
        },
        {
          role: "user" as const,
          content: [
            {
              type: "tool_result",
              tool_use_id: `live-${i}`,
              content: "verified",
            },
          ],
        },
      ]).flat(),
    ],
  };
  const pruned = pruneProviderToolHistory(body);
  expect(pruned.messages[0]).toEqual(body.messages[0]);
  expect(JSON.stringify(pruned.messages[1])).toContain(
    '\\"status\\":\\"error\\"',
  );
  expect(JSON.stringify(pruned)).not.toContain('"id":"old"');
  expect(JSON.stringify(pruned)).toContain('"id":"live-0"');
  expect(pruneProviderToolHistory(pruned)).toBe(pruned);
  expect(JSON.stringify(body)).toContain('"id":"old"');
});

test("probe outages pass PDFs and unknown models intact to provider admission", async () => {
  for (const metadataAvailable of [false, true]) {
    const body = JSON.stringify({
      model: "test-outage",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: "a".repeat(2_100_000),
              },
            },
          ],
        },
      ],
    });
    let forwarded = "";
    const fetcher = chatBudgetFetch(async (url, init) => {
      if (
        (url instanceof Request ? url.url : url.toString()).includes(
          "/models/",
        ) &&
        metadataAvailable
      )
        return Response.json({ max_input_tokens: 1000000, max_tokens: 128000 });
      if (
        !(url instanceof Request ? url.url : url.toString()).endsWith(
          "/messages",
        )
      )
        return new Response("unavailable", { status: 503 });
      if (typeof init?.body !== "string") throw new Error("Expected JSON");
      forwarded = init.body;
      return Response.json({ ok: true });
    });
    await fetcher("https://api.anthropic.com/v1/messages", { body });
    expect(forwarded).toBe(body);
  }
});

test("clearing local content is direct; delivery and publishing keep approval", () => {
  expect(growthActionPolicies.contentStrategyWrite.clearSeries.approval).toBe(
    "none",
  );
  expect(growthActionPolicies.adsWrite.setDelivery.approval).toBe("user");
  expect(growthActionPolicies.publishingWrite.publishNow.approval).toBe("user");
});

test("approval continuations preserve only the resumed assistant reasoning", () => {
  const assistant = {
    id: "a",
    role: "assistant" as const,
    parts: [{ type: "reasoning" as const, text: "signed live reasoning" }],
  };
  expect(JSON.stringify(chatHistoryForModel([assistant], true))).toContain(
    "signed live reasoning",
  );
  expect(chatHistoryForModel([assistant])).toEqual([]);
});
