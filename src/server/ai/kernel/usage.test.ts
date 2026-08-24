import { describe, expect, it } from "bun:test";
import type { LanguageModelUsage } from "ai";

import { summarizeGrowthUsage } from "./usage";

const usage = {
  inputTokens: 1_500,
  outputTokens: 100,
  totalTokens: 1_600,
  inputTokenDetails: {
    noCacheTokens: 300,
    cacheReadTokens: 700,
    cacheWriteTokens: 500,
  },
  outputTokenDetails: { textTokens: 100, reasoningTokens: 0 },
} satisfies LanguageModelUsage;

describe("summarizeGrowthUsage", () => {
  it("attributes Anthropic cache writes to TTL buckets", () => {
    expect(
      summarizeGrowthUsage(usage, [
        {
          providerMetadata: {
            anthropic: {
              usage: {
                cache_creation: {
                  ephemeral_5m_input_tokens: 200,
                  ephemeral_1h_input_tokens: 250,
                },
              },
            },
          },
        },
      ]),
    ).toMatchObject({
      cacheReadTokens: 700,
      cacheWriteTokens: 500,
      cacheWrite5mTokens: 200,
      cacheWrite1hTokens: 250,
      cacheWriteUnknownTokens: 50,
    });
  });

  it("keeps missing provider detail explicit", () => {
    expect(summarizeGrowthUsage(usage)).toMatchObject({
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      cacheWriteUnknownTokens: 500,
    });
  });
});
