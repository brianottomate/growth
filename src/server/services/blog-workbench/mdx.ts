import type { WorkbenchRun } from "./workflow";
import type { GeneratedArticle } from "./checks";

export type MdxArticleRun = Pick<WorkbenchRun, "runId"> & {
  stages: {
    normalizedBrief: { workingTitle: string; targetQuery: string };
    article: GeneratedArticle;
    grounding: { version: string; provenance: string };
  };
};

export function blogDraftSlug(record: MdxArticleRun): string {
  const query = record.stages.normalizedBrief.targetQuery
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100)
    .replace(/-$/, "");
  if (!query)
    throw new Error("A draft needs a target query with a usable slug.");
  return `builder-${query}`;
}

/** Model prose is Markdown, never executable MDX. Editorial components are added by an operator. */
export function serializeArticleMdx(record: MdxArticleRun): string {
  const { article, normalizedBrief, grounding } = record.stages;
  const body = article.sections
    .map(
      (section) =>
        `## ${escapeArticleMarkdown(section.heading)}\n\n${escapeArticleMarkdown(section.markdown)}`,
    )
    .join("\n\n");
  return [
    "---",
    `h1: ${JSON.stringify(normalizedBrief.workingTitle)}`,
    `metaTitle: ${JSON.stringify(article.metaTitle)}`,
    `metaDescription: ${JSON.stringify(article.metaDescription)}`,
    'publishedAt: "9999-12-31"',
    "category: Guides",
    "tags: []",
    "showStickyCTA: false",
    "enableAutoCtAs: false",
    "---",
    "",
    `<ArticleNote title="Draft evidence">${escapeArticleMarkdown(grounding.provenance)}</ArticleNote>`,
    "",
    body,
    "",
  ].join("\n");
}

export function escapeArticleMarkdown(text: string): string {
  if (/^\s*(?:import|export)\s/m.test(text))
    throw new Error(
      "Generated article contains an MDX module statement; review it before export.",
    );
  return text
    .replace(/</g, "&lt;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");
}
