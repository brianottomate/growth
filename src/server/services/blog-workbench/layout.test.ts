import { expect, test } from "bun:test";
import { articleLayoutSchema, serializeArticleLayout } from "./layout";
import type { MdxArticleRun } from "./mdx";

const run: MdxArticleRun = {
  runId: "test",
  stages: {
    normalizedBrief: { workingTitle: "Travel guide", targetQuery: "trip" },
    grounding: {
      version: "source-article-derived/v1",
      provenance: "Frozen source.",
    },
    article: {
      metaTitle: "Travel guide",
      metaDescription: "A trip.",
      sections: [{ heading: "Choose", markdown: "Known facts." }],
    },
  },
};
const layout = {
  sections: [
    {
      heading: "Choose",
      before: "Known facts.",
      after: "",
      blocks: [
        {
          kind: "links" as const,
          links: [
            {
              name: "Known home",
              href: "/property/known",
              label: "Property",
              note: 'Literal text: "; globalThis.injected = true; //',
            },
          ],
        },
      ],
    },
  ],
};

test("typed layout keeps model strings as JSON data and refuses executable prose", () => {
  const result = serializeArticleLayout(run, layout, ["/property/known"]);
  expect(result).toContain(
    JSON.stringify(layout.sections[0]!.blocks[0]!.links),
  );
  const unsafe = structuredClone(layout);
  unsafe.sections[0]!.before = "export const injected = true";
  expect(() =>
    serializeArticleLayout(run, unsafe, ["/property/known"]),
  ).toThrow("module statement");
  expect(() =>
    articleLayoutSchema.parse({
      sections: [
        {
          heading: "Choose",
          before: "",
          after: "",
          blocks: [{ kind: "raw-jsx", code: "<script />" }],
        },
      ],
    }),
  ).toThrow();
});
test("layout cannot introduce an ungrounded booking destination or reorder headings", () => {
  expect(() => serializeArticleLayout(run, layout, [])).toThrow(
    "destination link",
  );
  const changed = structuredClone(layout);
  changed.sections[0]!.heading = "Something else";
  expect(() =>
    serializeArticleLayout(run, changed, ["/property/known"]),
  ).toThrow("headings or order");
});

test("layout prose must use grounded destinations too", () => {
  const changed = structuredClone(layout);
  changed.sections[0]!.before =
    "[Unverified booking](https://invented.example)";
  expect(() =>
    serializeArticleLayout(run, changed, ["/property/known"]),
  ).toThrow("destination link");
});

test("property media attaches only to the exact grounded destination", () => {
  const result = serializeArticleLayout(run, layout, ["/property/known"], {
    "/property/known": {
      image: "https://assets.wander.com/known/640.webp",
      alt: "Listing cover",
    },
    "/property/other": {
      image: "https://assets.wander.com/other/640.webp",
      alt: "Other home",
    },
  });
  expect(result).toContain("https://assets.wander.com/known/640.webp");
  expect(result).not.toContain("https://assets.wander.com/other/640.webp");
});

test("all Markdown destination forms respect the grounded allowlist", () => {
  for (const prose of [
    '[Home](https://invented.example "title")',
    "[Home][stay]\n\n[stay]: https://invented.example",
    "[stay][]\n\n[stay]: https://invented.example",
    "[stay]\n\n[stay]: https://invented.example",
    "[Home](https://invented.example/path\\(one\\))",
    "![Photo](https://invented.example/image.jpg)",
  ]) {
    const changed = structuredClone(layout);
    changed.sections[0]!.before = prose;
    expect(() =>
      serializeArticleLayout(run, changed, ["/property/known"]),
    ).toThrow("destination link");
  }
  const changed = structuredClone(layout);
  changed.sections[0]!.before = "[Home][stay]";
  changed.sections[0]!.after = '[stay]: /property/known "Known home"';
  expect(serializeArticleLayout(run, changed, ["/property/known"])).toContain(
    "[Home][stay]",
  );
});

test("comparison caveats cannot be silently dropped by surplus table cells", () => {
  const changed = {
    sections: [
      {
        heading: "Choose",
        before: "",
        after: "",
        blocks: [
          {
            kind: "comparison" as const,
            caption: "Options",
            columns: ["Home", "Fit"],
            rows: [["Known", "Pool", "Important caveat"]],
            sourceNote: "Supplied facts",
          },
        ],
      },
    ],
  };
  expect(() => serializeArticleLayout(run, changed, [])).toThrow("more cells");
});
