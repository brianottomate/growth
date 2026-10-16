import { z } from "zod";

const blockSchema = z
  .object({
    type: z.string(),
    id: z.string().optional(),
    tool_use_id: z.string().optional(),
  })
  .passthrough();
const requestSchema = z
  .object({
    model: z.string(),
    max_tokens: z.number(),
    messages: z.array(
      z
        .object({
          role: z.enum(["user", "assistant"]),
          content: z.union([z.string(), z.array(blockSchema)]),
        })
        .passthrough(),
    ),
    tools: z
      .array(z.object({ type: z.string().optional() }).passthrough())
      .optional(),
    system: z.unknown().optional(),
  })
  .passthrough();
type RequestBody = z.infer<typeof requestSchema>;
const capacitySchema = z.object({
  max_input_tokens: z.number().positive(),
  max_tokens: z.number().positive(),
});
const countSchema = z.object({ input_tokens: z.number().nonnegative() });
const knownCapacity: Record<string, Capacity> = {
  "claude-sonnet-5": { max_input_tokens: 1_000_000, max_tokens: 128_000 },
};
type Capacity = z.infer<typeof capacitySchema>;
const capacities = new Map<string, { value: Capacity; expires: number }>();

/** Retire one completed historical pair in place, preserving the live turn. */
export function pruneProviderToolHistory(body: RequestBody): RequestBody {
  let latestInput = -1;
  for (let index = body.messages.length - 1; index >= 0; index--) {
    const message = body.messages[index]!;
    if (
      message.role === "user" &&
      (typeof message.content === "string" ||
        message.content.some(
          (block) =>
            !["tool_result", "tool_search_tool_result"].includes(block.type),
        ))
    ) {
      latestInput = index;
      break;
    }
  }
  const boundary = Math.min(body.messages.length - 6, latestInput);
  const allBlocks = body.messages.flatMap((message) =>
    typeof message.content === "string" ? [] : message.content,
  );
  const protectedIds = new Set(
    body.messages
      .slice(Math.max(0, boundary))
      .flatMap((message) =>
        typeof message.content === "string"
          ? []
          : message.content.flatMap((block) =>
              block.id
                ? [block.id]
                : block.tool_use_id
                  ? [block.tool_use_id]
                  : [],
            ),
      ),
  );
  for (let index = 0; index < boundary; index++) {
    const message = body.messages[index]!;
    if (typeof message.content === "string") continue;
    const call = message.content.find(
      (block) =>
        block.type === "tool_use" &&
        block.id &&
        !protectedIds.has(block.id) &&
        allBlocks.some(
          (result) =>
            result.type === "tool_result" && result.tool_use_id === block.id,
        ),
    );
    if (!call?.id) continue;
    const result = allBlocks.find(
      (block) => block.type === "tool_result" && block.tool_use_id === call.id,
    )!;
    const receipt = {
      status: result.is_error === true ? "error" : "result-recorded",
      excerpt: JSON.stringify(result.content ?? null).slice(0, 1500),
      truncated: JSON.stringify(result.content ?? null).length > 1500,
    };
    return {
      ...body,
      messages: body.messages
        .map((entry, at) => ({
          ...entry,
          content:
            typeof entry.content === "string"
              ? entry.content
              : entry.content.flatMap((block) => {
                  if (at === index && block === call)
                    return [
                      {
                        type: "text",
                        text: `Historical execution receipt (${call.id}): ${JSON.stringify(receipt)}. A recorded result does not prove success. Read current state before acting.`,
                      },
                    ];
                  return block.type === "tool_result" &&
                    block.tool_use_id === call.id
                    ? []
                    : [block];
                }),
        }))
        .filter((entry) => entry.content.length > 0),
    };
  }
  return body;
}

function countingRequest(body: RequestBody) {
  let excludedTokens = 0;
  // Count API excludes server tools and URL/file vision sources. Do not download
  // user URLs to count them. Reserve headroom for each excluded image/tool.
  const stripUnsupported = (value: unknown): unknown => {
    if (Array.isArray(value))
      return value.map(stripUnsupported).filter((item) => item !== undefined);
    if (!value || typeof value !== "object") return value;
    const record = value as Record<string, unknown>;
    const source = record.source;
    if (
      (record.type === "image" || record.type === "document") &&
      source &&
      typeof source === "object" &&
      "type" in source &&
      source.type !== "base64"
    ) {
      if (record.type === "document")
        throw new Error("Document token cost requires provider validation");
      excludedTokens += 16_000;
      return {
        type: "text",
        text: "[Attachment reserved separately in the token budget]",
      };
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [
        key,
        stripUnsupported(item),
      ]),
    );
  };
  const tools = body.tools
    ?.filter((definition) => {
      if (definition.type && definition.type !== "custom") {
        excludedTokens += 20_000;
        return false;
      }
      return true;
    })
    .map(({ defer_loading: _deferred, ...definition }) => definition);
  return {
    body: {
      model: body.model,
      system: body.system,
      tools,
      messages: stripUnsupported(body.messages),
    },
    excludedTokens,
  };
}

/** Budget the provider's actual serialized request, including system and active tool schemas. */
type ChatFetch = (
  url: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => ReturnType<typeof fetch>;

export function chatBudgetFetch(transport: ChatFetch = fetch): typeof fetch {
  const budgetedFetch: ChatFetch = async (url, init) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    if (typeof init?.body !== "string" || !requestUrl.endsWith("/messages"))
      return transport(url, init);
    let body = requestSchema.parse(JSON.parse(init.body));
    const base = requestUrl.slice(0, -"/messages".length);
    const headers = init.headers;
    const signal = init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000);
    let capacity = capacities.get(body.model);
    if (!capacity || capacity.expires < Date.now()) {
      let value: Capacity;
      try {
        const response = await transport(
          `${base}/models/${encodeURIComponent(body.model)}`,
          { headers, signal },
        );
        if (!response.ok) throw new Error("Model metadata unavailable");
        value = capacitySchema.parse(await response.json());
      } catch {
        const fallback = knownCapacity[body.model];
        if (init.signal?.aborted) init.signal.throwIfAborted();
        if (!fallback) return transport(url, init);
        value = fallback;
      }
      capacity = { value, expires: Date.now() + 3_600_000 };
      capacities.set(body.model, capacity);
    }
    body.max_tokens = Math.min(body.max_tokens, capacity.value.max_tokens);
    const unprunedBody = JSON.stringify(body);
    // Reserve the complete response ceiling plus 5% for estimation differences,
    // tool-search expansion, and provider overhead.
    const inputLimit =
      capacity.value.max_input_tokens -
      body.max_tokens -
      Math.ceil(capacity.value.max_input_tokens * 0.05);
    const count = async (request: RequestBody): Promise<number | null> => {
      try {
        const projected = countingRequest(request);
        const countHeaders = new Headers(headers);
        countHeaders.delete("content-length");
        const response = await transport(`${base}/messages/count_tokens`, {
          method: "POST",
          headers: countHeaders,
          signal,
          body: JSON.stringify(projected.body),
        });
        if (!response.ok) throw new Error("Token counting unavailable");
        return (
          countSchema.parse(await response.json()).input_tokens +
          projected.excludedTokens
        );
      } catch {
        if (init.signal?.aborted) init.signal.throwIfAborted();
        // The Messages API owns admission when a probe is unavailable. Never
        // destroy evidence or reject a PDF based on its encoded byte length.
        return null;
      }
    };
    let tokens = await count(body);
    if (tokens === null) return transport(url, { ...init, body: unprunedBody });
    while (tokens > inputLimit) {
      const pruned = pruneProviderToolHistory(body);
      if (pruned === body) break;
      body = pruned;
      tokens = await count(body);
      if (tokens === null)
        return transport(url, { ...init, body: unprunedBody });
    }
    if (tokens > inputLimit)
      throw new Error(
        "This request contains too much context for the model. The current turn and saved history are intact. Start a new chat with the specific work item and your latest instructions.",
      );
    return transport(url, { ...init, body: JSON.stringify(body) });
  };
  return Object.assign(budgetedFetch, { preconnect: fetch.preconnect });
}
