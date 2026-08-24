import type { LanguageModelUsage } from "ai";

interface StepLike {
  providerMetadata?: unknown;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const nonNegativeNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;

export function summarizeGrowthUsage(
  usage: LanguageModelUsage,
  steps: readonly StepLike[] = [],
) {
  const cacheWriteTokens = nonNegativeNumber(
    usage.inputTokenDetails.cacheWriteTokens,
  );
  let cacheWrite5mTokens = 0;
  let cacheWrite1hTokens = 0;
  for (const step of steps) {
    const provider = asRecord(step.providerMetadata);
    const anthropic = asRecord(provider?.anthropic);
    const rawUsage = asRecord(anthropic?.usage);
    const creation = asRecord(rawUsage?.cache_creation);
    cacheWrite5mTokens += nonNegativeNumber(
      creation?.ephemeral_5m_input_tokens,
    );
    cacheWrite1hTokens += nonNegativeNumber(
      creation?.ephemeral_1h_input_tokens,
    );
  }
  const attributed = cacheWrite5mTokens + cacheWrite1hTokens;
  if (attributed > cacheWriteTokens && attributed > 0) {
    const scale = cacheWriteTokens / attributed;
    cacheWrite5mTokens = Math.round(cacheWrite5mTokens * scale);
    cacheWrite1hTokens = cacheWriteTokens - cacheWrite5mTokens;
  }
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    noCacheTokens: usage.inputTokenDetails.noCacheTokens,
    cacheReadTokens: usage.inputTokenDetails.cacheReadTokens,
    cacheWriteTokens,
    cacheWrite5mTokens,
    cacheWrite1hTokens,
    cacheWriteUnknownTokens: Math.max(
      0,
      cacheWriteTokens - cacheWrite5mTokens - cacheWrite1hTokens,
    ),
    reasoningTokens: usage.outputTokenDetails.reasoningTokens,
  };
}
