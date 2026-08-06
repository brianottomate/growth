import { describe, expect, test } from "bun:test";

import { compactGrowthError, GrowthActionError } from "./errors";

describe("compactGrowthError", () => {
  test("a guard's declared code survives, so the model gets a recovery path", () => {
    const compact = compactGrowthError(
      new GrowthActionError(
        "invalid_input",
        "Platform draft ppt_nope is not part of this work item.",
      ),
    );
    expect(compact.code).toBe("invalid_input");
    expect(compact.suggestedAction).toBe(
      "Correct the input and call the tool again.",
    );
  });

  test("an untyped guard message with no trigger words degrades to tool_failed", () => {
    // This is why GrowthActionError exists. The sentence below is a real guard
    // rejection of a bad id, but it contains none of codeFor's keywords, so it
    // grades as an unrecoverable tool failure and the model is told to stop.
    // Fine as a fallback for third-party errors; wrong for our own guards.
    const compact = compactGrowthError(
      new Error("A selected platform draft is not part of this work item."),
    );
    expect(compact.code).toBe("tool_failed");
    expect(compact.retryable).toBe(false);
  });
});
