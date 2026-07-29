import { parse5ToStructuredText } from "datocms-html-to-structured-text";
import { marked } from "marked";
import { parse } from "parse5";

/**
 * Convert operator-authored Markdown into the DAST shape DatoCMS stores.
 * Keeping this conversion in one place makes new drafts and body revisions use
 * the same semantics as the existing Growth-to-Dato publishing bridge.
 */
export async function markdownToDatoStructuredText(markdown: string) {
  const source = markdown.trim();
  if (!source) throw new Error("The blog body is empty.");

  const html = await marked.parse(source);
  const structuredText = await parse5ToStructuredText(
    parse(html, { sourceCodeLocationInfo: true }),
  );
  if (!structuredText) {
    throw new Error("Markdown conversion produced no structured text.");
  }
  return structuredText;
}
