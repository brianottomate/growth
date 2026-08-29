import { describe, expect, test } from "bun:test";

import { shouldAutoOpenAssistant } from "./assistant-route-behavior";

describe("assistant route behavior", () => {
  test("opens on the assistant's own home", () => {
    expect(shouldAutoOpenAssistant("/app/next")).toBe(true);
  });

  test("opens beside an individual blog article without changing other blog surfaces", () => {
    expect(shouldAutoOpenAssistant("/app/blog/pp_article")).toBe(true);
    expect(shouldAutoOpenAssistant("/app/blog")).toBe(false);
    expect(shouldAutoOpenAssistant("/app/blog/preview/dato_article")).toBe(
      false,
    );
  });
});
