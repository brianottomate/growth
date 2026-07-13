// @ts-nocheck -- Bun's test module is runtime-provided and not in this app's TS libs.
import { describe, expect, test } from "bun:test";

import { classifyFetchUrl } from "./url-safety";

describe("classifyFetchUrl", () => {
  test("accepts and canonicalizes public web URLs", () => {
    expect(classifyFetchUrl("https://example.com/article#section")).toEqual({
      ok: true,
      url: "https://example.com/article",
    });
  });

  test.each([
    "http://localhost:3000",
    "http://127.0.0.1/private",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.2",
    "http://service.internal",
    "file:///etc/passwd",
    "https://user:pass@example.com",
  ])("rejects unsafe target %s", (url) => {
    expect(classifyFetchUrl(url).ok).toBe(false);
  });
});
