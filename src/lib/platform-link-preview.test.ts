import { describe, expect, test } from "bun:test";

import { supportsNativeLinkPreview } from "./platform-link-preview";

describe("supportsNativeLinkPreview", () => {
  test("matches platforms that render article cards from post URLs", () => {
    expect(supportsNativeLinkPreview("linkedin")).toBe(true);
    expect(supportsNativeLinkPreview("x")).toBe(true);
    expect(supportsNativeLinkPreview("facebook")).toBe(true);
    expect(supportsNativeLinkPreview("threads")).toBe(true);
  });

  test("does not promise an unfurl for caption-only platforms", () => {
    expect(supportsNativeLinkPreview("instagram")).toBe(false);
    expect(supportsNativeLinkPreview("tiktok")).toBe(false);
    expect(supportsNativeLinkPreview("youtube")).toBe(false);
  });
});
