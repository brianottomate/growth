import { describe, expect, test } from "bun:test";
import { convertToModelMessages, type ModelMessage, type UIMessage } from "ai";
import {
  chatHistoryForModel,
  chatModelOutput,
  compactChatMessages,
} from "./chat-context";

describe("future chat recovery", () => {
  test("an interrupted approval is evidence of uncertainty, never a replayable call on a new user turn", async () => {
    const history = [
      {
        id: "a",
        role: "assistant",
        parts: [
          {
            type: "tool-adsWrite__setAdStatus",
            state: "approval-responded",
            toolCallId: "c",
            input: { adId: "ad", status: "drawn" },
            approval: { id: "approval", approved: true },
          },
        ],
      },
      {
        id: "u",
        role: "user",
        parts: [{ type: "text", text: "Continue, keep the new photo." }],
      },
    ] as UIMessage[];
    const sanitized = chatHistoryForModel(history);
    const model = await convertToModelMessages(sanitized, {
      ignoreIncompleteToolCalls: true,
    });
    expect(JSON.stringify(model)).not.toContain('"type":"tool-call"');
    expect(JSON.stringify(model)).toContain("effect is unknown");
    expect(JSON.stringify(model)).toContain("keep the new photo");
    expect(history[0]?.parts[0]).toHaveProperty("state", "approval-responded");
  });

  test("a validated trailing approval remains executable and retains its exact input", async () => {
    const history = [
      {
        id: "a",
        role: "assistant",
        parts: [
          {
            type: "tool-adsWrite__push",
            state: "approval-responded",
            toolCallId: "c",
            input: { campaignId: "campaign" },
            approval: { id: "approval", approved: true },
          },
        ],
      },
    ] as UIMessage[];
    const model = await convertToModelMessages(chatHistoryForModel(history), {
      ignoreIncompleteToolCalls: true,
    });
    const compacted = compactChatMessages(model);
    expect(compacted.at(-1)?.role).toBe("tool");
    expect(JSON.stringify(compacted)).toContain("tool-approval-response");
    expect(JSON.stringify(compacted)).toContain('"campaignId":"campaign"');
  });
});

describe("model context", () => {
  test("follow-up instructions retain earlier uploaded images without restoring other file types", async () => {
    const image = {
      type: "file" as const,
      mediaType: "image/png",
      url: "https://example.com/earlier-photo.png",
    };
    const history: UIMessage[] = [
      {
        id: "upload",
        role: "user",
        parts: [
          image,
          {
            type: "file",
            mediaType: "application/pdf",
            url: "https://example.com/document.pdf",
          },
        ],
      },
      {
        id: "follow-up",
        role: "user",
        parts: [{ type: "text", text: "Use the photo I uploaded earlier." }],
      },
    ];
    const model = await convertToModelMessages(chatHistoryForModel(history));
    expect(JSON.stringify(model)).toContain(image.url);
    expect(JSON.stringify(model)).toContain(
      "Use the photo I uploaded earlier.",
    );
    expect(JSON.stringify(model)).not.toContain("document.pdf");
    expect(history[0]?.parts).toHaveLength(2);
  });

  test("a large individual editable document remains complete within the expanded guardrail", () => {
    const copy = "x".repeat(100000);
    const output = chatModelOutput("adsRead__ideaContext", {
      ok: true,
      data: { document: { copy } },
    });
    expect(output.value).toEqual({ ok: true, data: { document: { copy } } });
  });

  test("catalog inventory preserves every editable card and ID without loading galleries or export rows", () => {
    const output = {
      ok: true,
      data: {
        draft: {
          cards: [{ homeId: "h", title: "Keep this", approved: false }],
        },
        homes: [
          {
            id: "h",
            name: "Cabin",
            gallery: Array(200).fill({ url: "x".repeat(1000) }),
          },
        ],
        exports: [
          { id: "export", status: "running", rows: ["x".repeat(200000)] },
        ],
      },
    };
    const model = chatModelOutput("adsRead__catalogState", output);
    const text = JSON.stringify(model);
    expect(text).toContain("Keep this");
    expect(text).toContain('"id":"h"');
    expect(text).toContain('"status":"running"');
    expect(text.length).toBeLessThan(2000);
    expect(output.data.homes[0]?.gallery).toHaveLength(200);
  });

  test("campaign inventory directs edits to an individual document and keeps versions and all ad IDs", () => {
    const model = chatModelOutput("adsRead__openCampaign", {
      ok: true,
      data: {
        ads: [
          {
            id: "ad",
            updatedAt: "current",
            placements: "x".repeat(200000),
            content: {
              format: "carousel",
              ideaStudio: { document: { cards: [{ id: "slide" }] } },
            },
          },
        ],
      },
    });
    expect(JSON.stringify(model)).toContain('"miniStudio":true');
    expect(JSON.stringify(model)).toContain('"id":"slide"');
    expect(JSON.stringify(model)).toContain("current");
    expect(JSON.stringify(model).length).toBeLessThan(1000);
  });

  test("oversized documents are explicitly omitted, never truncated into an editable partial document", () => {
    const output = chatModelOutput("adsRead__ideaContext", {
      ok: true,
      data: { document: { copy: "x".repeat(500000) } },
    });
    expect(JSON.stringify(output)).toContain("not a complete document");
    expect(JSON.stringify(output)).not.toContain('"document"');
  });

  test("per-step compaction keeps user corrections and matching recent call/result IDs", () => {
    const messages: ModelMessage[] = [
      {
        role: "user",
        content: "Keep the bedrooms; remove the location caption.",
      },
    ];
    for (let n = 0; n < 20; n++)
      messages.push(
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: String(n),
              toolName: "save",
              input: { document: "x".repeat(150000) },
            },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: String(n),
              toolName: "save",
              output: { type: "json", value: { ok: true, id: String(n) } },
            },
          ],
        },
      );
    const compacted = compactChatMessages(messages);
    expect(JSON.stringify(compacted)).toContain("Keep the bedrooms");
    const calls = compacted.flatMap((m) =>
      m.role === "assistant" && Array.isArray(m.content)
        ? m.content
            .filter((p) => p.type === "tool-call")
            .map((p) => p.toolCallId)
        : [],
    );
    const results = compacted.flatMap((m) =>
      m.role === "tool"
        ? m.content
            .filter((p) => p.type === "tool-result")
            .map((p) => p.toolCallId)
        : [],
    );
    expect(calls).toEqual(results);
    expect(calls).toContain("19");
    expect(JSON.stringify(compacted).length).toBeLessThan(2000000);
  });
});
