import type { CreativeDocument } from "./creative-document";

export function articleMarkdown(
  document: Extract<CreativeDocument, { type: "article" }>,
) {
  const c = document.content;
  return {
    filename: `${(c.slug || "article").replace(/[^a-zA-Z0-9_-]/g, "-")}.md`,
    markdown: [
      "---",
      `title: ${JSON.stringify(c.title)}`,
      `description: ${JSON.stringify(c.description)}`,
      `slug: ${JSON.stringify(c.slug)}`,
      `author: ${JSON.stringify(c.authorName)}`,
      "---",
      "",
      `# ${c.title}`,
      "",
      c.bodyMarkdown,
      "",
    ].join("\n"),
  };
}
