import { describe, expect, test } from "bun:test";

import { appendLiveUrlToPlatformPost } from "@/lib/platform-post-link";

describe("appendLiveUrlToPlatformPost", () => {
  test("adds a source URL once", () => {
    const url = "https://x.com/wander/status/123";
    expect(appendLiveUrlToPlatformPost("Worth sharing", url)).toBe(
      `Worth sharing\n\n${url}`,
    );
    expect(
      appendLiveUrlToPlatformPost(`Worth sharing\n\n${url}`, url),
    ).toBeNull();
  });
});
