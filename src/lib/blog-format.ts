/** Shared production contract for planning, writing, revision and export. */
export const BLOG_FORMAT_RULES = `PRODUCTION BLOG FORMAT
Write ordinary Markdown using headings, paragraphs, bold/italic text, links, numbered or bulleted lists, and blockquotes for sourced quotations.
Quick answers and FAQs use a heading followed by short answers. Trade-offs use Benefits and Considerations headings with bullets. Itineraries use numbered lists. Property recommendations use headings, factual descriptions and verified links.
Small comparison tables are supported: use unique, descriptive, non-numeric column headings and plain-text cells. Keep links and images outside tables. Use at most six columns and twenty rows.
Standalone inline images are supported only for image URLs explicitly supplied from the brand media library. Put each image in its own paragraph, with factual alt text. Never invent image URLs or use placeholders. The hero image is selected separately; do not repeat it in the body without a reason.
Do not emit JSX/MDX components, raw HTML, galleries, custom cards, embeds, task checkboxes, code blocks or horizontal rules. Express the useful information with the supported formats above. Do not put internal layout suggestions into the article body.`;
