import type { ModelMessage } from "ai";
import type { JSONObject, SharedV4ProviderOptions } from "@ai-sdk/provider";

export type GrowthPromptCacheTtl = "5m" | "1h";

export const GROWTH_CONVERSATION_CACHE_TTL = "1h" as const;
export const GROWTH_TOOL_LOOP_CACHE_TTL = "5m" as const;

/** Move Anthropic's cache breakpoint to the current tool-loop tail. */
export function withGrowthRollingCache(
  messages: readonly ModelMessage[],
  ttl: GrowthPromptCacheTtl,
): ModelMessage[] {
  if (messages.length === 0) return [];
  const lastIndex = messages.length - 1;
  return messages.map((message, index) => {
    const providerOptions: SharedV4ProviderOptions =
      message.providerOptions ?? {};
    const anthropic: JSONObject = providerOptions.anthropic ?? {};
    if (index !== lastIndex) {
      if (message.role === "system" || !("cacheControl" in anthropic)) {
        return message;
      }
      const remainingAnthropic = { ...anthropic };
      delete remainingAnthropic.cacheControl;
      return {
        ...message,
        providerOptions: {
          ...providerOptions,
          anthropic: remainingAnthropic,
        },
      };
    }
    return {
      ...message,
      providerOptions: {
        ...providerOptions,
        anthropic: {
          ...anthropic,
          cacheControl: { type: "ephemeral", ttl },
        },
      },
    };
  });
}
