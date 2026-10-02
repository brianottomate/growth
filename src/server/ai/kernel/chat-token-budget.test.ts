import { expect, test } from "bun:test";
import { z } from "zod";
function urlText(url: Parameters<typeof fetch>[0]) {
  return typeof url === "string"
    ? url
    : url instanceof URL
      ? url.href
      : url.url;
}
function bodyText(init?: Parameters<typeof fetch>[1]) {
  if (typeof init?.body !== "string")
    throw new Error("Expected a serialized request");
  return init.body;
}
import { chatBudgetFetch } from "./chat-token-budget";

test("the provider budget counts system and tool definitions, reserves output, and removes complete old pairs", async () => {
  const counts: Record<string, unknown>[] = [];
  let sent: Record<string, unknown> | undefined;
  const transport = chatBudgetFetch(async (url, init) => {
    if (urlText(url).includes("/models/"))
      return Response.json({ max_input_tokens: 1000, max_tokens: 100 });
    const body = z
      .record(z.string(), z.unknown())
      .parse(JSON.parse(bodyText(init)));
    if (urlText(url).endsWith("count_tokens")) {
      counts.push(body);
      return Response.json({ input_tokens: counts.length === 1 ? 900 : 200 });
    }
    sent = body;
    return Response.json({ ok: true });
  });
  const messages = [
    { role: "user", content: "Keep my original photo and instructions." },
    {
      role: "assistant",
      content: [{ type: "tool_use", id: "old", name: "read", input: {} }],
    },
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "old", content: "old inventory" },
      ],
    },
    ...Array.from({ length: 6 }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      content: "Recent instructions",
    })),
    {
      role: "assistant",
      content: [{ type: "tool_use", id: "recent", name: "read", input: {} }],
    },
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "recent", content: "current" },
      ],
    },
  ];
  await transport("https://api.anthropic.com/v1/messages", {
    method: "POST",
    body: JSON.stringify({
      model: "budget-pairs",
      max_tokens: 100,
      system: "System instructions",
      tools: [{ name: "read", input_schema: { type: "object" } }],
      messages,
    }),
  });
  expect(counts).toHaveLength(2);
  expect(counts[0]).toHaveProperty("system", "System instructions");
  expect(counts[0]).toHaveProperty("tools", [
    { name: "read", input_schema: { type: "object" } },
  ]);
  expect(JSON.stringify(sent)).not.toContain('"id":"old"');
  expect(JSON.stringify(sent)).not.toContain('"tool_use_id":"old"');
  expect(JSON.stringify(sent)).toContain('"id":"recent"');
  expect(JSON.stringify(sent)).toContain('"tool_use_id":"recent"');
  expect(JSON.stringify(sent)).toContain("Keep my original photo");
});

test("a smaller model cannot exceed its context with user text after reserving response tokens", async () => {
  let generated = false;
  const transport = chatBudgetFetch(async (url) => {
    if (urlText(url).includes("/models/"))
      return Response.json({ max_input_tokens: 1000, max_tokens: 100 });
    if (urlText(url).endsWith("count_tokens"))
      return Response.json({ input_tokens: 900 });
    generated = true;
    return Response.json({ ok: true });
  });
  const failure = await transport("https://api.anthropic.com/v1/messages", {
    body: JSON.stringify({
      model: "budget-small",
      max_tokens: 100,
      messages: [{ role: "user", content: "Essential instructions" }],
    }),
  }).then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(Error);
  expect(failure).toHaveProperty(
    "message",
    expect.stringContaining("Completed actions are saved"),
  );
  expect(generated).toBe(false);
});

test("unsupported counting inputs reserve space and a counting outage still allows an ordinary chat", async () => {
  let generated = false;
  const transport = chatBudgetFetch(async (url, init) => {
    if (urlText(url).includes("/models/"))
      return Response.json({ max_input_tokens: 1000000, max_tokens: 128000 });
    if (urlText(url).endsWith("count_tokens")) {
      const body = z
        .record(z.string(), z.unknown())
        .parse(JSON.parse(bodyText(init)));
      expect(body.tools).toEqual([]);
      expect(JSON.stringify(body)).not.toContain(
        "https://example.com/photo.png",
      );
      return new Response("unavailable", { status: 503 });
    }
    expect(bodyText(init)).toContain("https://example.com/photo.png");
    expect(bodyText(init)).toContain("tool_search_tool_bm25_20251119");
    generated = true;
    return Response.json({ ok: true });
  });
  await transport("https://api.anthropic.com/v1/messages", {
    body: JSON.stringify({
      model: "budget-vision",
      max_tokens: 128000,
      tools: [{ type: "tool_search_tool_bm25_20251119", name: "toolSearch" }],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "url", url: "https://example.com/photo.png" },
            },
            { type: "text", text: "Use this photo" },
          ],
        },
      ],
    }),
  });
  expect(generated).toBe(true);
});
