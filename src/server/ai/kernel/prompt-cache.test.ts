import { describe, expect, it } from "bun:test";
import type { ModelMessage } from "ai";

import { growthCacheTtlForStep, withGrowthRollingCache } from "./prompt-cache";

describe("withGrowthRollingCache", () => {
  it("moves a one-hour breakpoint to the current conversation tail", () => {
    const messages: ModelMessage[] = [
      { role: "system", content: "Stable instructions" },
      { role: "user", content: "Review this campaign." },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "tool-1",
            toolName: "contentRead",
            output: { type: "text", value: "Campaign evidence" },
          },
        ],
      },
    ];

    const cached = withGrowthRollingCache(messages, "1h");
    expect(cached[0]).toBe(messages[0]);
    expect(cached[1]).toBe(messages[1]);
    expect(cached[2]?.providerOptions).toEqual({
      anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } },
    });
  });

  it("preserves provider options on the tail", () => {
    const cached = withGrowthRollingCache(
      [
        {
          role: "user",
          content: "Keep metadata",
          providerOptions: {
            anthropic: { customFlag: true },
            openai: { store: false },
          },
        },
      ],
      "5m",
    );
    expect(cached[0]?.providerOptions).toEqual({
      anthropic: {
        customFlag: true,
        cacheControl: { type: "ephemeral", ttl: "5m" },
      },
      openai: { store: false },
    });
  });

  it("removes the previous rolling marker while preserving static system cache", () => {
    const cached = withGrowthRollingCache(
      [
        {
          role: "system",
          content: "Stable",
          providerOptions: {
            anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } },
          },
        },
        {
          role: "user",
          content: "Earlier tail",
          providerOptions: {
            anthropic: {
              customFlag: true,
              cacheControl: { type: "ephemeral", ttl: "5m" },
            },
          },
        },
        { role: "assistant", content: "Current tail" },
      ],
      "5m",
    );
    expect(cached[0]?.providerOptions?.anthropic).toEqual({
      cacheControl: { type: "ephemeral", ttl: "1h" },
    });
    expect(cached[1]?.providerOptions?.anthropic).toEqual({ customFlag: true });
    expect(cached[2]?.providerOptions?.anthropic).toEqual({
      cacheControl: { type: "ephemeral", ttl: "5m" },
    });
  });

  it("handles an empty conversation", () => {
    expect(withGrowthRollingCache([], "5m")).toEqual([]);
  });

  it("uses the long cache once and cheaper writes inside the tool loop", () => {
    expect(growthCacheTtlForStep(0)).toBe("1h");
    expect(growthCacheTtlForStep(1)).toBe("5m");
    expect(growthCacheTtlForStep(8)).toBe("5m");
  });
});
