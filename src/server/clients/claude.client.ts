import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageCreateParams,
  MessageStreamEvent,
  Message,
  TextBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { env } from "@/env";

// =====================================================
// CLIENT INITIALIZATION
// =====================================================

/**
 * Check if Claude/Anthropic is configured
 *
 * Use this to conditionally enable Claude features without throwing.
 */
export const isClaudeConfigured = !!env.ANTHROPIC_API_KEY;

if (!isClaudeConfigured) {
  console.warn(
    "⚠️ [Claude] ANTHROPIC_API_KEY not configured. Claude client will not be available.",
  );
}

/**
 * Anthropic client instance (singleton)
 *
 * The official Anthropic SDK client for making API calls to Claude.
 * Can be used directly or through the wrapper functions below.
 *
 * @throws {Error} If ANTHROPIC_API_KEY is not configured (at module initialization)
 * @see https://docs.anthropic.com/en/api/getting-started
 */
export const anthropic = isClaudeConfigured
  ? new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    })
  : (null as unknown as Anthropic);

// =====================================================
// MODEL CONSTANTS
// =====================================================

/**
 * Claude model identifiers
 *
 * Use these constants instead of hardcoded strings for type safety.
 * Updated as of January 2025.
 */
export const CLAUDE_MODELS = {
  // Sonnet models - Best balance of intelligence and speed
  SONNET_4_5: "claude-sonnet-4-5-20250929", // Current: Fast, intelligent, best for most tasks
  SONNET_4: "claude-sonnet-4-20250514", // Previous Sonnet 4
  SONNET_3_7: "claude-sonnet-3-7-20250219", // Economy tier, 3x cheaper
  SONNET_3_5: "claude-3-5-sonnet-20241022", // Legacy

  // Opus models - Maximum intelligence
  OPUS_4_5: "claude-opus-4-5-20251101", // Most capable, expensive
  OPUS_4: "claude-opus-4-20250514", // Previous Opus 4

  // Haiku models - Fastest, most affordable
  HAIKU_3_5: "claude-3-5-haiku-20241022", // Fast, affordable
} as const;

/**
 * Default model to use when not specified
 * Sonnet 4.5 is the best balance for most use cases
 */
export const DEFAULT_MODEL = CLAUDE_MODELS.SONNET_4_5;

// =====================================================
// BASIC MESSAGE CREATION
// =====================================================

/**
 * Create a message with Claude
 *
 * This is a thin wrapper around the Anthropic SDK's messages.create() method.
 * Use this for simple, non-streaming requests.
 *
 * @example
 * ```ts
 * const response = await createMessage({
 *   messages: [{ role: "user", content: "What is the capital of France?" }],
 * });
 * console.log(response.content[0].text);
 * ```
 *
 * @example With system prompt and options
 * ```ts
 * const response = await createMessage({
 *   system: "You are a helpful assistant specialized in geography.",
 *   messages: [{ role: "user", content: "Tell me about Paris." }],
 *   model: CLAUDE_MODELS.OPUS_4_5, // Use a more powerful model
 *   max_tokens: 2000,
 *   temperature: 0.7,
 * });
 * ```
 */
export async function createMessage(
  params: Omit<MessageCreateParams, "model" | "max_tokens" | "stream"> & {
    model?: string;
    max_tokens?: number;
  },
): Promise<Message> {
  console.log("🤖 [Claude] Creating message with model:", params.model ?? DEFAULT_MODEL);

  const response = await anthropic.messages.create({
    model: params.model ?? DEFAULT_MODEL,
    max_tokens: params.max_tokens ?? 4096, // Reasonable default
    stream: false, // Explicitly not streaming
    ...params,
  });

  console.log("✅ [Claude] Message created:", {
    id: response.id,
    model: response.model,
    stopReason: response.stop_reason,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });

  return response;
}

/**
 * Simple text completion
 *
 * A simplified wrapper for basic text completions without needing to
 * construct the full messages array. Good for simple Q&A.
 *
 * @example
 * ```ts
 * const response = await completeText({
 *   prompt: "Explain quantum computing in simple terms",
 *   system: "You are a science educator for middle school students",
 * });
 * console.log(response.text);
 * console.log(`Used ${response.usage.total_tokens} tokens`);
 * ```
 */
export async function completeText(params: {
  prompt: string;
  system?: string;
  model?: string;
  max_tokens?: number;
  temperature?: number;
}): Promise<{
  text: string;
  message: Message;
  usage: { input_tokens: number; output_tokens: number; total_tokens: number };
}> {
  const message = await createMessage({
    system: params.system,
    messages: [{ role: "user", content: params.prompt }],
    model: params.model,
    max_tokens: params.max_tokens,
    temperature: params.temperature,
  });

  // Extract text from response
  const textContent = message.content.find(
    (block): block is TextBlock => block.type === "text",
  );

  return {
    text: textContent?.text ?? "",
    message,
    usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
      total_tokens: message.usage.input_tokens + message.usage.output_tokens,
    },
  };
}

// =====================================================
// STREAMING
// =====================================================

/**
 * Create a streaming message with Claude
 *
 * Use this when you want to stream the response token-by-token.
 * The SDK returns an async iterable of events.
 *
 * @example Basic streaming
 * ```ts
 * const stream = await streamMessage({
 *   messages: [{ role: "user", content: "Write a short story" }],
 * });
 *
 * for await (const event of stream) {
 *   if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
 *     process.stdout.write(event.delta.text);
 *   }
 * }
 * ```
 *
 * @example With custom handler
 * ```ts
 * const stream = await streamMessage({
 *   messages: [{ role: "user", content: "Explain photosynthesis" }],
 * });
 *
 * let fullText = "";
 * for await (const event of stream) {
 *   if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
 *     fullText += event.delta.text;
 *     // Send to client via SSE, websocket, etc.
 *   }
 * }
 * ```
 */
export async function streamMessage(
  params: Omit<MessageCreateParams, "model" | "max_tokens" | "stream"> & {
    model?: string;
    max_tokens?: number;
  },
): Promise<AsyncIterable<MessageStreamEvent>> {
  console.log("🌊 [Claude] Creating streaming message with model:", params.model ?? DEFAULT_MODEL);

  const stream = anthropic.messages.stream({
    model: params.model ?? DEFAULT_MODEL,
    max_tokens: params.max_tokens ?? 4096,
    ...params,
  });

  console.log("✅ [Claude] Streaming started");

  return stream;
}

/**
 * Helper to collect a complete response from a stream
 *
 * Sometimes you want streaming internally but need the full result.
 * This helper collects all the text from a stream.
 *
 * @example
 * ```ts
 * const result = await collectStreamedResponse({
 *   messages: [{ role: "user", content: "Write a haiku" }],
 * });
 * console.log(result.text);
 * console.log(`Took ${result.durationMs}ms`);
 * ```
 */
export async function collectStreamedResponse(
  params: Parameters<typeof streamMessage>[0],
): Promise<{
  text: string;
  usage: { input_tokens: number; output_tokens: number; total_tokens: number };
  durationMs: number;
}> {
  const startTime = Date.now();
  const stream = await streamMessage(params);

  let text = "";
  const usage = { input_tokens: 0, output_tokens: 0 };

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      text += event.delta.text;
    } else if (event.type === "message_start") {
      usage.input_tokens = event.message.usage.input_tokens;
    } else if (event.type === "message_delta") {
      usage.output_tokens = event.usage.output_tokens;
    }
  }

  return {
    text,
    usage: {
      ...usage,
      total_tokens: usage.input_tokens + usage.output_tokens,
    },
    durationMs: Date.now() - startTime,
  };
}

// =====================================================
// MULTI-TURN CONVERSATIONS
// =====================================================

/**
 * Conversation message type
 * Simplified type for building conversations
 */
export type ConversationMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

/**
 * Continue a multi-turn conversation
 *
 * Claude's Messages API is stateless, so you need to send the full
 * conversation history each time. This helper makes that easier.
 *
 * @example
 * ```ts
 * const conversation: ConversationMessage[] = [];
 *
 * // First turn
 * const response1 = await continueConversation({
 *   history: conversation,
 *   newMessage: "Hello, my name is Alice",
 * });
 * conversation.push(
 *   { role: "user", content: "Hello, my name is Alice" },
 *   { role: "assistant", content: response1.text }
 * );
 *
 * // Second turn - Claude remembers the context
 * const response2 = await continueConversation({
 *   history: conversation,
 *   newMessage: "What's my name?",
 * });
 * // Response: "Your name is Alice."
 * ```
 */
export async function continueConversation(params: {
  history: ConversationMessage[];
  newMessage: string;
  system?: string;
  model?: string;
  max_tokens?: number;
}): Promise<{
  text: string;
  message: Message;
  updatedHistory: ConversationMessage[];
}> {
  const messages = [...params.history, { role: "user" as const, content: params.newMessage }];

  const message = await createMessage({
    system: params.system,
    messages,
    model: params.model,
    max_tokens: params.max_tokens,
  });

  const textContent = message.content.find(
    (block): block is TextBlock => block.type === "text",
  );
  const responseText = textContent?.text ?? "";

  return {
    text: responseText,
    message,
    updatedHistory: [
      ...messages,
      { role: "assistant" as const, content: responseText },
    ],
  };
}

// =====================================================
// VISION (IMAGE ANALYSIS)
// =====================================================

/**
 * Analyze an image with Claude
 *
 * Claude can understand images. Provide either a base64-encoded image
 * or a URL to an image.
 *
 * Supported formats: image/jpeg, image/png, image/gif, image/webp
 *
 * @example With base64
 * ```ts
 * const response = await analyzeImage({
 *   imageData: base64ImageData,
 *   mediaType: "image/jpeg",
 *   prompt: "What's in this image?",
 * });
 * ```
 *
 * @example With URL
 * ```ts
 * const response = await analyzeImageFromUrl({
 *   imageUrl: "https://example.com/image.jpg",
 *   prompt: "Describe this image in detail",
 * });
 * ```
 */
export async function analyzeImage(params: {
  imageData: string; // base64 encoded
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  prompt: string;
  system?: string;
  model?: string;
}): Promise<{ text: string; message: Message }> {
  const message = await createMessage({
    system: params.system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: params.mediaType,
              data: params.imageData,
            },
          },
          {
            type: "text",
            text: params.prompt,
          },
        ],
      },
    ],
    model: params.model,
  });

  const textContent = message.content.find(
    (block): block is TextBlock => block.type === "text",
  );

  return {
    text: textContent?.text ?? "",
    message,
  };
}

/**
 * Analyze an image from a URL
 *
 * Simpler version that fetches and converts the image for you.
 */
export async function analyzeImageFromUrl(params: {
  imageUrl: string;
  prompt: string;
  system?: string;
  model?: string;
}): Promise<{ text: string; message: Message }> {
  console.log("🖼️ [Claude] Analyzing image from URL:", params.imageUrl);

  const message = await createMessage({
    system: params.system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "url",
              url: params.imageUrl,
            },
          },
          {
            type: "text",
            text: params.prompt,
          },
        ],
      },
    ],
    model: params.model,
  });

  const textContent = message.content.find(
    (block): block is TextBlock => block.type === "text",
  );

  return {
    text: textContent?.text ?? "",
    message,
  };
}

// =====================================================
// PREFILL / RESPONSE SHAPING
// =====================================================

/**
 * Create a message with a prefilled response start
 *
 * You can "put words in Claude's mouth" to guide the response format.
 * Useful for structured outputs or specific formats.
 *
 * @example Force JSON output
 * ```ts
 * const response = await createMessageWithPrefill({
 *   prompt: "List the top 3 programming languages",
 *   prefill: "{\n  \"languages\": [",
 *   system: "Always respond with valid JSON",
 * });
 * // Response continues: "\"Python\", \"JavaScript\", \"Java\"]\n}"
 * ```
 *
 * @example Force specific format
 * ```ts
 * const response = await createMessageWithPrefill({
 *   prompt: "What is the capital of France?",
 *   prefill: "The answer is (",
 *   max_tokens: 1, // Just get the letter
 * });
 * // Response: "A" or "B" or "C" etc.
 * ```
 */
export async function createMessageWithPrefill(params: {
  prompt: string;
  prefill: string;
  system?: string;
  model?: string;
  max_tokens?: number;
}): Promise<{ text: string; fullText: string; message: Message }> {
  const message = await createMessage({
    system: params.system,
    messages: [
      { role: "user", content: params.prompt },
      { role: "assistant", content: params.prefill },
    ],
    model: params.model,
    max_tokens: params.max_tokens,
  });

  const textContent = message.content.find(
    (block): block is TextBlock => block.type === "text",
  );
  const continuedText = textContent?.text ?? "";

  return {
    text: continuedText, // Just the new text
    fullText: params.prefill + continuedText, // Prefill + new text
    message,
  };
}

// =====================================================
// TOKEN COUNTING & UTILITIES
// =====================================================

/**
 * Calculate token usage for a message
 *
 * This doesn't make an API call - it just helps you understand
 * the token breakdown from a response.
 */
export function calculateTokenUsage(message: Message): {
  input: number;
  output: number;
  total: number;
  costUsd?: number;
} {
  const { input_tokens, output_tokens } = message.usage;

  return {
    input: input_tokens,
    output: output_tokens,
    total: input_tokens + output_tokens,
    // You can add cost calculation here based on model pricing
    // See: https://www.anthropic.com/pricing
  };
}

/**
 * Extract text from Claude's response
 *
 * Helper to get just the text content from a message.
 */
export function extractText(message: Message): string {
  const textBlocks = message.content.filter(
    (block): block is TextBlock => block.type === "text",
  );
  return textBlocks.map((block) => block.text).join("\n");
}

/**
 * Check if a response was stopped due to token limit
 */
export function wasStoppedByTokenLimit(message: Message): boolean {
  return message.stop_reason === "max_tokens";
}

/**
 * Check if a response completed naturally
 */
export function wasCompletedNaturally(message: Message): boolean {
  return message.stop_reason === "end_turn";
}

// =====================================================
// ERROR HANDLING HELPERS
// =====================================================

/**
 * Type guard for Anthropic API errors
 */
export function isAnthropicError(error: unknown): error is Error & {
  status?: number;
  message: string;
} {
  return (
    error instanceof Error &&
    "status" in error &&
    typeof (error as { status?: number }).status === "number"
  );
}

/**
 * Handle Anthropic API errors gracefully
 *
 * @example
 * ```ts
 * try {
 *   const response = await createMessage({ ... });
 * } catch (error) {
 *   const handled = handleAnthropicError(error);
 *   if (handled.isRateLimited) {
 *     // Implement retry logic
 *   }
 * }
 * ```
 */
export function handleAnthropicError(error: unknown): {
  message: string;
  statusCode?: number;
  isRateLimited: boolean;
  isAuthError: boolean;
  isOverloaded: boolean;
  originalError: unknown;
} {
  if (isAnthropicError(error)) {
    const status = error.status;
    return {
      message: error.message,
      statusCode: status,
      isRateLimited: status === 429,
      isAuthError: status === 401,
      isOverloaded: status === 529,
      originalError: error,
    };
  }

  return {
    message: error instanceof Error ? error.message : "Unknown error",
    isRateLimited: false,
    isAuthError: false,
    isOverloaded: false,
    originalError: error,
  };
}
