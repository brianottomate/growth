import { validate } from "datocms-structured-text-utils";
import { marked, type Token, type Tokens } from "marked";

import type { GeneratedArticle } from "./checks";
import type { BlogRunRecord } from "./run";

// Serializes a golden-run article into a DatoCMS-shaped draft. The real
// wander.com blog is DatoCMS: BlogArticleRecord with title, url (slug),
// description, tags/author (link records), image (upload), and body as
// STRUCTURED TEXT (dast), not markdown — see wander.com
// src/app/(blog)/article/[slug]/_components/Article_Content. So the export
// is two parts: fields we can produce deterministically (title, slug,
// description, body converted markdown→dast and validated with DatoCMS's own
// validator), and references that only resolve against the CMA at push time
// (tag/author record IDs, cover image upload). We have a read-only CDA token
// today; pushing needs a CMA token, so this stays a draft artifact.

export const DATO_EXPORT_VERSION = "datocms-draft/v1";

type DastNode = Record<string, unknown>;

export type DatoDraftExport = {
  version: typeof DATO_EXPORT_VERSION;
  runId: string;
  derivedAt: string;
  model: "blog_article";
  attributes: {
    title: string;
    url: string;
    description: string;
    body: { schema: "dast"; document: DastNode };
  };
  dastValidation: { valid: boolean; message: string | null };
  unresolved: Array<{ field: string; note: string }>;
  pushRequirements: string[];
};

export function buildDatoDraftExport(record: BlogRunRecord): DatoDraftExport {
  const article = record.stages.article;
  const document = articleToDast(article);
  const validation = validate({ schema: "dast", document } as never);

  return {
    version: DATO_EXPORT_VERSION,
    runId: record.runId,
    derivedAt: new Date().toISOString(),
    model: "blog_article",
    attributes: {
      title: record.stages.normalizedBrief.workingTitle,
      url: slugify(record.stages.normalizedBrief.workingTitle),
      description: article.metaDescription,
      body: { schema: "dast", document },
    },
    dastValidation: {
      valid: validation.valid,
      message: validation.valid ? null : (validation.message ?? "invalid"),
    },
    unresolved: [
      {
        field: "tags",
        note: `Link records; resolve by name at push time. Candidates from the brief: ${record.stages.normalizedBrief.entitiesToCover.slice(0, 5).join(", ")}. Existing tag vocabulary: Destinations, Travel Guides, Travel Inspiration, Property Management, Announcements.`,
      },
      {
        field: "author",
        note: "Link record; pick a real author record ID at push time.",
      },
      {
        field: "image",
        note: "Upload reference; the run produces no cover image yet.",
      },
    ],
    pushRequirements: [
      "A DatoCMS CMA (management) token — the configured CDA token is read-only",
      "The blog_article item type ID from the CMA schema",
      "Create as DRAFT (item meta { status: draft }); never auto-publish",
    ],
  };
}

// ---- MARKDOWN → DAST ----------------------------------------------------

/**
 * Converts the typed article into a dast document: an h1-less body where
 * each section contributes an h2 heading plus its markdown content. Only
 * the node set the writer actually emits is handled (headings, paragraphs,
 * lists, blockquotes, emphasis, links); anything else degrades to plain
 * text rather than guessing.
 */
export function articleToDast(article: GeneratedArticle): DastNode {
  const children: DastNode[] = [];
  for (const section of article.sections) {
    children.push({
      type: "heading",
      level: 2,
      children: [{ type: "span", value: section.heading }],
    });
    children.push(...markdownBlocksToDast(section.markdown));
  }
  return { type: "root", children };
}

function markdownBlocksToDast(markdown: string): DastNode[] {
  // The writer links properties as raw `<a href>` per the prompt contract;
  // normalize to markdown links so the lexer sees them as link tokens.
  const normalized = markdown.replace(
    /<a\s+href="([^"]+)"\s*>([^<]*)<\/a>/g,
    (_match, href: string, label: string) => `[${label}](${href})`,
  );

  const nodes: DastNode[] = [];
  for (const token of marked.lexer(normalized)) {
    const node = blockTokenToDast(token);
    if (node) nodes.push(...node);
  }
  return nodes;
}

function blockTokenToDast(token: Token): DastNode[] | null {
  switch (token.type) {
    case "heading": {
      const heading = token as Tokens.Heading;
      return [
        {
          type: "heading",
          level: Math.min(Math.max(heading.depth, 1), 6),
          children: inlineTokensToDast(heading.tokens ?? []),
        },
      ];
    }
    case "paragraph": {
      const paragraph = token as Tokens.Paragraph;
      return [
        {
          type: "paragraph",
          children: inlineTokensToDast(paragraph.tokens ?? []),
        },
      ];
    }
    case "list": {
      const list = token as Tokens.List;
      return [
        {
          type: "list",
          style: list.ordered ? "numbered" : "bulleted",
          children: list.items.map((item) => ({
            type: "listItem",
            children: listItemChildren(item),
          })),
        },
      ];
    }
    case "blockquote": {
      const quote = token as Tokens.Blockquote;
      const inner = quote.tokens.flatMap(
        (child) => blockTokenToDast(child) ?? [],
      );
      return [{ type: "blockquote", children: inner }];
    }
    case "space":
      return null;
    default: {
      // Unknown block: degrade to a plain paragraph of its raw text.
      const raw = "raw" in token ? String(token.raw).trim() : "";
      return raw
        ? [{ type: "paragraph", children: [{ type: "span", value: raw }] }]
        : null;
    }
  }
}

function listItemChildren(item: Tokens.ListItem): DastNode[] {
  const children = (item.tokens ?? []).flatMap(
    (child) => blockTokenToDast(child) ?? [],
  );
  // dast listItem children must be paragraphs or nested lists; marked emits
  // `text` tokens for tight lists, which blockTokenToDast degrades to
  // paragraphs already, so only guard the empty case.
  return children.length > 0
    ? children
    : [{ type: "paragraph", children: [{ type: "span", value: "" }] }];
}

function inlineTokensToDast(
  tokens: Token[],
  marks: string[] = [],
): DastNode[] {
  const nodes: DastNode[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "text": {
        const text = token as Tokens.Text;
        if (text.tokens && text.tokens.length > 0) {
          nodes.push(...inlineTokensToDast(text.tokens, marks));
        } else {
          nodes.push(span(text.text, marks));
        }
        break;
      }
      case "strong":
        nodes.push(
          ...inlineTokensToDast((token as Tokens.Strong).tokens, [
            ...marks,
            "strong",
          ]),
        );
        break;
      case "em":
        nodes.push(
          ...inlineTokensToDast((token as Tokens.Em).tokens, [
            ...marks,
            "emphasis",
          ]),
        );
        break;
      case "codespan":
        nodes.push(span((token as Tokens.Codespan).text, [...marks, "code"]));
        break;
      case "link": {
        const link = token as Tokens.Link;
        nodes.push({
          type: "link",
          url: link.href,
          children: inlineTokensToDast(link.tokens, marks),
        });
        break;
      }
      case "escape":
        nodes.push(span((token as Tokens.Escape).text, marks));
        break;
      default:
        if ("raw" in token && String(token.raw)) {
          nodes.push(span(String(token.raw), marks));
        }
    }
  }
  return nodes;
}

function span(value: string, marks: string[]): DastNode {
  const decoded = decodeEntities(value);
  return marks.length > 0
    ? { type: "span", value: decoded, marks }
    : { type: "span", value: decoded };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
