import {
  emailHeaderTemplateId,
  emailHeaderFormatIdSchema,
  type EmailHeaderFormatId,
  type EmailHeaderTemplateId,
} from "@/lib/email-header-compositions";
import {
  HOMES_MARKER_PATTERN,
  homesMarker,
  markerGroupIndex,
} from "@/lib/listings-digest";

/**
 * An email body read as the pieces a reader sees: each top-level paragraph,
 * heading, list, image and each spot a group of home cards goes. Nothing is
 * stored this way; the body stays one string, and editing a block writes it
 * back. A block's position is its id in the preview (`data-block`).
 */
export type BlockKind =
  | "text"
  | "heading"
  | "list"
  | "image"
  | "homes"
  | "other";

export type EmailBlock = {
  id: string;
  kind: BlockKind;
  source: string;
  /** For a homes block: which group of the issue's homes it places. */
  group?: number;
};

const MARKER = new RegExp(HOMES_MARKER_PATTERN.source);

/** HTML bodies are read as elements; homes markers alone don't make one. */
export function isHtmlBody(body: string) {
  return /<[a-z][^>]*>|<!--/i.test(
    body.replace(new RegExp(HOMES_MARKER_PATTERN.source, "g"), ""),
  );
}

let counter = 0;
const nextId = () => `block-${++counter}`;

function homesBlock(source: string): EmailBlock {
  return {
    id: nextId(),
    kind: "homes",
    source,
    group: markerGroupIndex(source) ?? 0,
  };
}

function htmlKind(element: Element): BlockKind {
  const tag = element.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "ul" || tag === "ol") return "list";
  if (tag === "img") return "image";
  if (tag === "p") {
    const onlyImage =
      element.children.length === 1 &&
      element.children[0]!.tagName.toLowerCase() === "img" &&
      !element.textContent?.trim();
    return onlyImage ? "image" : "text";
  }
  return "other";
}

function markdownKind(source: string): BlockKind {
  if (/^#{1,6}\s/.test(source)) return "heading";
  if (/^(\s*[-*]\s|\s*\d+\.\s)/.test(source)) return "list";
  if (/^!\[[^\]]*\]\([^)]+\)$/.test(source.trim())) return "image";
  return "text";
}

export function toBlocks(body: string): EmailBlock[] {
  if (!isHtmlBody(body)) {
    return body
      .split(/\n{2,}/)
      .map((source) => source.trim())
      .filter(Boolean)
      .map((source) =>
        MARKER.test(source)
          ? homesBlock(source)
          : { id: nextId(), kind: markdownKind(source), source },
      );
  }
  const doc = new DOMParser().parseFromString(
    `<!doctype html><body>${body}</body>`,
    "text/html",
  );
  const blocks: EmailBlock[] = [];
  for (const node of Array.from(doc.body.childNodes)) {
    if (node.nodeType === Node.COMMENT_NODE) {
      const source = `<!--${node.nodeValue}-->`;
      blocks.push(
        MARKER.test(source)
          ? homesBlock(source)
          : { id: nextId(), kind: "other", source },
      );
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      blocks.push({
        id: nextId(),
        kind: htmlKind(element),
        source: element.outerHTML,
      });
    } else if (node.textContent?.trim()) {
      blocks.push({
        id: nextId(),
        kind: "text",
        source: node.textContent.trim(),
      });
    }
  }
  return blocks;
}

export function fromBlocks(blocks: EmailBlock[], html: boolean) {
  return blocks.map((block) => block.source).join(html ? "" : "\n\n");
}

/**
 * The body with each block's position on it, for the preview only: a click
 * there names the block. Markers stay bare; the email's groups carry their
 * own `data-group`.
 */
export function previewBody(body: string) {
  const html = isHtmlBody(body);
  return toBlocks(body)
    .map((block, index) => {
      if (block.kind === "homes") return block.source;
      if (!html) {
        return `<div data-block="${index}">\n\n${block.source}\n\n</div>`;
      }
      const doc = new DOMParser().parseFromString(
        `<!doctype html><body>${block.source}</body>`,
        "text/html",
      );
      const element = doc.body.firstElementChild;
      if (!element) return `<p data-block="${index}">${block.source}</p>`;
      element.setAttribute("data-block", String(index));
      return element.outerHTML;
    })
    .join(html ? "" : "\n\n");
}

export function newTextBlock(html: boolean): EmailBlock {
  return {
    id: nextId(),
    kind: "text",
    source: html ? "<p>New paragraph</p>" : "New paragraph",
  };
}

export function newHomesBlock(group: number): EmailBlock {
  return homesBlock(homesMarker(group));
}

/** Point every homes block past a removed group at its new position. */
export function renumberGroups(blocks: EmailBlock[], removed: number) {
  return blocks.map((block) =>
    block.kind === "homes" && (block.group ?? 0) > removed
      ? {
          ...block,
          group: block.group! - 1,
          source: homesMarker(block.group! - 1),
        }
      : block,
  );
}

/** What a closed block shows: its words, or its image. */
export function blockSummary(block: EmailBlock, html: boolean) {
  if (!html) return block.source.replace(/[#*_>`[\]()!-]/g, "").trim();
  const doc = new DOMParser().parseFromString(block.source, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** A header card's settings, kept on its image so the card can be redone. */
export type HeaderCard = {
  source: string;
  /** Absent on older cards, which use the original email-header layout. */
  templateId?: EmailHeaderTemplateId;
  /** No format means the untouched original photo (or legacy default banner). */
  formatId?: EmailHeaderFormatId;
  eyebrow: string;
  title: string;
  detail: string;
};

export type EmailImage = { src: string; alt: string; card?: HeaderCard };

export function blockImage(
  block: EmailBlock,
  html: boolean,
): EmailImage | null {
  if (block.kind !== "image") return null;
  if (!html) {
    const match = /^!\[([^\]]*)\]\(([^)]+)\)/.exec(block.source.trim());
    return match ? { alt: match[1] ?? "", src: match[2] ?? "" } : null;
  }
  const doc = new DOMParser().parseFromString(block.source, "text/html");
  const img = doc.querySelector("img");
  if (!img) return null;
  const source = img.getAttribute("data-card-source");
  return {
    alt: img.getAttribute("alt") ?? "",
    src: img.getAttribute("src") ?? "",
    ...(source
      ? {
          card: {
            source,
            templateId: emailHeaderTemplateId(
              img.getAttribute("data-card-template"),
            ),
            ...(emailHeaderFormatIdSchema.safeParse(
              img.getAttribute("data-card-format"),
            ).success
              ? {
                  formatId: emailHeaderFormatIdSchema.parse(
                    img.getAttribute("data-card-format"),
                  ),
                }
              : {}),
            eyebrow: img.getAttribute("data-card-eyebrow") ?? "",
            title: img.getAttribute("data-card-title") ?? "",
            detail: img.getAttribute("data-card-detail") ?? "",
          },
        }
      : {}),
  };
}

export function imageSource(
  src: string,
  alt: string,
  html: boolean,
  card?: HeaderCard,
) {
  if (!html) return `![${alt}](${src})`;
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const attrs = card
    ? ` data-card-source="${escape(card.source)}" data-card-template="${card.templateId ?? "email-header"}"${card.formatId ? ` data-card-format="${card.formatId}"` : ""} data-card-eyebrow="${escape(card.eyebrow)}" data-card-title="${escape(card.title)}" data-card-detail="${escape(card.detail)}"`
    : "";
  return `<p><img src="${escape(src)}" alt="${escape(alt)}"${attrs}></p>`;
}
