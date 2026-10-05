import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import {
  markdownToDatoStructuredText,
  prepareDatoMarkdown,
  type BlogMarkdownBlock,
} from "./dato-markdown";

const block = (attributes: Record<string, unknown>) => ({
  type: "block" as const,
  item: {
    type: "item" as const,
    attributes,
    relationships: {
      item_type: { data: { type: "item_type" as const, id: "test-model" } },
    },
  },
});

test("tables and standalone images become ordered Dato blocks without losing cells, URLs or alt text", async () => {
  const resolved: BlogMarkdownBlock[] = [];
  const result = await markdownToDatoStructuredText(
    "## Compare\n\n| Choice | Why |\n| --- | --- |\n| **A &amp; B** | Quiet \\| spacious |\n\n![A real home](https://example.com/home.jpg)\n\nRead [the details](https://example.com/details).",
    {
      resolveBlock: async (input) => {
        resolved.push(input);
        return block({ content: input });
      },
    },
  );
  expect(result.document.children.map((n) => n.type)).toEqual([
    "heading",
    "block",
    "block",
    "paragraph",
  ]);
  expect(resolved).toEqual([
    {
      kind: "table",
      columns: ["Choice", "Why"],
      data: [{ Choice: "A & B", Why: "Quiet | spacious" }],
    },
    { kind: "image", url: "https://example.com/home.jpg", alt: "A real home" },
  ]);
  expect(JSON.stringify(result)).toContain("https://example.com/details");
});

test("unsupported constructs fail before even an earlier valid image can trigger an upload", async () => {
  for (const source of [
    '<ArticleQuickAnswers title={"Facts"} answers={[]} />',
    '<iframe src="https://example.com"></iframe>',
    "- [x] Booked",
    "---",
    "Text ![nested](https://example.com/a.jpg)",
    "| Same | Same |\n| --- | --- |\n| a | b |",
    "| Link |\n| --- |\n| [Click](https://example.com) |",
    "[bad](javascript:alert(1))",
  ]) {
    let writes = 0;
    await assert.rejects(
      markdownToDatoStructuredText(
        `![Valid](https://example.com/first.jpg)\n\n${source}`,
        {
          resolveBlock: async () => {
            writes++;
            return block({});
          },
        },
      ),
    );
    expect(writes).toBe(0);
  }
});

test("FAQs, trade-offs, itineraries and quotations retain native structure without custom components", async () => {
  const result = await markdownToDatoStructuredText(
    "## Questions\n\n### Where?\n\nAt **booth 747**.\n\n## Trade-offs\n\n- One advantage\n- One consideration\n\n## Plan\n\n1. Arrive\n2. Visit\n\n> A sourced quotation.",
  );
  expect(result.document.children.map((n) => n.type)).toEqual([
    "heading",
    "heading",
    "paragraph",
    "heading",
    "list",
    "heading",
    "list",
    "blockquote",
  ]);
  expect(JSON.stringify(result)).toContain("booth 747");
});

test("a standalone image is never silently discarded when no image adapter is provided", async () => {
  await assert.rejects(
    markdownToDatoStructuredText("![House](https://example.com/house.jpg)"),
    /export adapter/,
  );
  expect(
    (
      await prepareDatoMarkdown(
        "Before\n\n![House](https://example.com/house.jpg)\n\nAfter",
      )
    ).blocks,
  ).toHaveLength(1);
});
