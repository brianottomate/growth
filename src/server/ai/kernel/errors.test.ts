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
    // lands on the catch-all. Fine as a fallback for third-party errors we don't
    // control; wrong for our own guards, which know why they refused.
    const compact = compactGrowthError(
      new Error("A selected platform draft is not part of this work item."),
    );
    expect(compact.code).toBe("tool_failed");
  });

  test("the fallback lets the model act on a correction the message names", () => {
    // The incident: tool_failed's guidance was an unconditional "do not retry",
    // handed to a model whose problem was a fixable id. It abandoned the edit
    // and moved on to an unrelated publish. Measured over every guard in
    // src/server/ai/capabilities, 23 of 77 land on this fallback when they
    // should carry a more specific code, so this one sentence is the guidance
    // most of those failures actually get. It must not forbid all recovery.
    const compact = compactGrowthError(new Error("Something unclassifiable."));
    expect(compact.suggestedAction).toMatch(/retry only if/i);
  });
});
