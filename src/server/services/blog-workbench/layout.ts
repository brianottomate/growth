import { z } from "zod";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { GeneratedArticle } from "./checks";
import {
  escapeArticleMarkdown,
  serializeArticleMdx,
  type MdxArticleRun,
} from "./mdx";

const text = z.string();
const blockSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("answers"),
    title: text,
    answers: z
      .array(z.object({ priority: text, answer: text, reason: text }))
      .max(8),
  }),
  z.object({
    kind: z.literal("comparison"),
    caption: text,
    columns: z.array(text).min(2).max(6),
    rows: z.array(z.array(text)).max(12),
    sourceNote: text,
  }),
  z.object({
    kind: z.literal("tradeoffs"),
    title: text,
    benefits: z.array(text),
    cautions: z.array(text),
  }),
  z.object({
    kind: z.literal("links"),
    links: z
      .array(z.object({ name: text, href: text, label: text, note: text }))
      .max(4),
  }),
]);
export const articleLayoutSchema = z.object({
  sections: z.array(
    z.object({
      heading: text,
      before: text,
      blocks: z.array(blockSchema).max(3),
      after: text,
    }),
  ),
});
export type ArticleLayout = z.infer<typeof articleLayoutSchema>;

function validateRows(layout: ArticleLayout) {
  for (const section of layout.sections)
    for (const block of section.blocks)
      if (
        block.kind === "comparison" &&
        block.rows.some((row) => row.length > block.columns.length)
      )
        throw new Error("Comparison row has more cells than columns");
}

function validateProseLinks(layout: ArticleLayout, allowed: Set<string>) {
  const prose = layout.sections
    .flatMap((section) => [section.before, section.after])
    .join("\n\n");
  const tree = fromMarkdown(prose);
  const visit = (node: typeof tree | (typeof tree.children)[number]): void => {
    if ("url" in node && !allowed.has(node.url))
      throw new Error("Layout invented a destination link");
    if ("children" in node) for (const child of node.children) visit(child);
  };
  visit(tree);
}

/** Model chooses data from an allowlist, never JSX or executable expressions. */
export function serializeArticleLayout(
  run: MdxArticleRun,
  layout: ArticleLayout,
  allowedHrefs: string[],
  propertyMedia: Record<
    string,
    {
      image: string;
      alt: string;
      rating?: number | null;
      bedrooms?: number | null;
      bathrooms?: number | null;
      location?: string | null;
    }
  > = {},
) {
  const parsed = articleLayoutSchema.parse(layout);
  validateRows(parsed);
  if (
    parsed.sections.length !== run.stages.article.sections.length ||
    parsed.sections.some(
      (section, i) =>
        section.heading !== run.stages.article.sections[i]?.heading,
    )
  )
    throw new Error("Layout changed article headings or order");
  const allowed = new Set(allowedHrefs);
  validateProseLinks(parsed, allowed);
  const body = parsed.sections
    .map((section) => {
      const blocks = section.blocks.map((block) => {
        switch (block.kind) {
          case "answers":
            return `<ArticleQuickAnswers title={${JSON.stringify(block.title)}} answers={${JSON.stringify(block.answers)}} />`;
          case "comparison":
            return `<ArticleComparison caption={${JSON.stringify(block.caption)}} columns={${JSON.stringify(block.columns)}} rows={${JSON.stringify(block.rows)}} sourceNote={${JSON.stringify(block.sourceNote)}} />`;
          case "tradeoffs":
            return `<ArticleTradeoffs title={${JSON.stringify(block.title)}} benefits={${JSON.stringify(block.benefits)}} cautions={${JSON.stringify(block.cautions)}} />`;
          case "links": {
            if (block.links.some((link) => !allowed.has(link.href)))
              throw new Error("Layout invented a destination link");
            return `<ArticleLinks links={${JSON.stringify(block.links.map((link) => ({ ...link, ...propertyMedia[link.href], ...(propertyMedia[link.href] ? { alt: `${link.name} listing cover` } : {}) })))}} />`;
          }
        }
      });
      return [
        `## ${escapeArticleMarkdown(section.heading)}`,
        escapeArticleMarkdown(section.before),
        ...blocks,
        escapeArticleMarkdown(section.after),
      ]
        .filter(Boolean)
        .join("\n\n");
    })
    .join("\n\n");
  // Retain the exact common draft metadata and evidence note.
  const shell = serializeArticleMdx({
    ...run,
    stages: { ...run.stages, article: { ...run.stages.article, sections: [] } },
  });
  return `${shell}\n${body}\n`;
}

/** Evaluate all displayed copy, including component data added during layout. */
export function layoutAsArticle(
  article: GeneratedArticle,
  layout: ArticleLayout,
): GeneratedArticle {
  validateRows(articleLayoutSchema.parse(layout));
  return {
    ...article,
    sections: layout.sections.map((section) => ({
      heading: section.heading,
      markdown: [
        section.before,
        ...section.blocks.map((block) => JSON.stringify(block)),
        section.after,
      ].join("\n\n"),
    })),
  };
}
