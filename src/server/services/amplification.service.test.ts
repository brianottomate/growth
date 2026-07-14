import { describe, expect, test } from "bun:test";

import {
  amplifierHandlesAccount,
  normalizedSocialHandle,
} from "./amplification-matching";

describe("amplification matching", () => {
  test("normalizes @ prefixes and case", () => {
    expect(normalizedSocialHandle(" @ItsAjChan ")).toBe("itsajchan");
  });

  test("requires both platform and account to match", () => {
    const handles = [{ platform: "linkedin", handle: "itsajchan" }];
    expect(amplifierHandlesAccount(handles, "linkedin", "@ItsAjChan")).toBe(
      true,
    );
    expect(amplifierHandlesAccount(handles, "x", "itsajchan")).toBe(false);
  });
});
