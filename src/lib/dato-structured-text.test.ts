import { describe, expect, test } from "bun:test";

import { datoStructuredTextToPlainText } from "./dato-structured-text";

describe("Dato structured text", () => {
  test("keeps the complete draft prose in reading order for analysis", () => {
    const value = {
      schema: "dast",
      document: {
        type: "root",
        children: [
          {
            type: "heading",
            level: 2,
            children: [{ type: "span", value: "A new chapter" }],
          },
          {
            type: "paragraph",
            children: [
              { type: "span", value: "Wander welcomes " },
              { type: "span", value: "the Maple team." },
            ],
          },
        ],
      },
    };

    expect(datoStructuredTextToPlainText(value)).toBe(
      "A new chapter\nWander welcomes the Maple team.",
    );
  });
});
