import { describe, expect, test } from "bun:test";

import { amplifierHandlesAccount } from "./amplification-matching";

describe("amplification matching", () => {
  test("matches the same platform account despite harmless handle formatting", () => {
    const handles = [{ platform: "linkedin", handle: "itsajchan" }];
    expect(amplifierHandlesAccount(handles, "linkedin", " @ItsAjChan ")).toBe(
      true,
    );
  });

  test("does not attribute activity from another platform or account", () => {
    const handles = [{ platform: "linkedin", handle: "itsajchan" }];
    expect(amplifierHandlesAccount(handles, "x", "itsajchan")).toBe(false);
    expect(amplifierHandlesAccount(handles, "linkedin", "someone-else")).toBe(
      false,
    );
    expect(amplifierHandlesAccount(handles, "linkedin", null)).toBe(false);
  });
});
