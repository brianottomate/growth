import { describe, expect, test } from "bun:test";

import { datoStructuredTextToPlainText } from "./dato-structured-text";
import { markdownToDatoStructuredText } from "./dato-markdown";

describe("Dato Markdown conversion", () => {
  test("preserves a complete article body in readable order", async () => {
    const body = await markdownToDatoStructuredText(`
## Building the operating system for travel

WanderOS gives operators a unified platform.

- Direct bookings
- Guest marketing
`);

    expect(datoStructuredTextToPlainText(body)).toContain(
      "Building the operating system for travel",
    );
    expect(datoStructuredTextToPlainText(body)).toContain(
      "WanderOS gives operators a unified platform.",
    );
    expect(datoStructuredTextToPlainText(body)).toContain("Direct bookings");
    expect(datoStructuredTextToPlainText(body)).toContain("Guest marketing");
  });
});
