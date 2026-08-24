import type { ModelMessage } from "ai";

type ModelProviderOptions = NonNullable<ModelMessage["providerOptions"]>;

export type GrowthPromptCacheTtl = "5m" | "1h";

export const GROWTH_CONVERSATION_CACHE_TTL = "1h" as const;
export const GROWTH_TOOL_LOOP_CACHE_TTL = "5m" as const;

export function growthCacheTtlForStep(stepNumber: number) {
  return stepNumber === 0
    ? GROWTH_CONVERSATION_CACHE_TTL
    : GROWTH_TOOL_LOOP_CACHE_TTL;
}

/** Move Anthropic's cache breakpoint to the current tool-loop tail. */
export function withGrowthRollingCache(
  messages: readonly ModelMessage[],
  ttl: GrowthPromptCacheTtl,
): ModelMessage[] {
  if (messages.length === 0) return [];
  const lastIndex = messages.length - 1;
  return messages.map((message, index) => {
    const providerOptions: ModelProviderOptions = message.providerOptions ?? {};
    const anthropic = providerOptions.anthropic ?? {};
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
