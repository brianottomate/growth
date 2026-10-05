import { parse5ToStructuredText } from "datocms-html-to-structured-text";
import { Marked, type Token, type Tokens } from "marked";
import { parse } from "parse5";
import { decode } from "he";

export type BlogMarkdownBlock =
  | { kind: "table"; columns: string[]; data: Record<string, string>[] }
  | { kind: "image"; url: string; alt: string };
export type DatoMarkdownBlock = {
  type: "block";
  item: {
    type: "item";
    attributes: Record<string, unknown>;
    relationships: { item_type: { data: { type: "item_type"; id: string } } };
  };
};
const unsupported = (what: string): never => {
  throw new Error(
    `Blog export does not support ${what}. Use headings, paragraphs, lists, simple tables, or standalone library images instead.`,
  );
};
function cellText(tokens: Token[]): string {
  return tokens
    .map((token) => {
      if (token.type === "text" || token.type === "escape")
        return decode((token as Tokens.Text | Tokens.Escape).text);
      if (token.type === "strong" || token.type === "em")
        return cellText((token as Tokens.Strong | Tokens.Em).tokens);
      return unsupported(
        "links, images or other rich content inside table cells",
      );
    })
    .join("");
}
function assertUrl(url: string) {
  if (!/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(url))
    unsupported("this link or image URL scheme");
}

/** Parse and validate the whole body before any CMS upload or write. */
export async function prepareDatoMarkdown(markdown: string) {
  if (!markdown.trim()) throw new Error("The blog body is empty.");
  const blocks: BlogMarkdownBlock[] = [];
  const placeholder = (block: BlogMarkdownBlock) => {
    const index = blocks.push(block) - 1;
    return `<growth-block data-index="${index}"></growth-block>\n`;
  };
  const parser = new Marked({
    walkTokens(token) {
      if (["html", "code", "hr", "del"].includes(token.type))
        unsupported(
          token.type === "html" ? "raw HTML or custom components" : token.type,
        );
      if (token.type === "list_item" && (token as Tokens.ListItem).task)
        unsupported("task checkboxes");
      if (
        token.type === "text" &&
        /<\/?[A-Za-z][\w.-]*(?:\s|\/?>)/.test((token as Tokens.Text).text)
      )
        unsupported("component markup");
      if (token.type === "link" || token.type === "image")
        assertUrl((token as Tokens.Link | Tokens.Image).href);
    },
    renderer: {
      table(token: Tokens.Table) {
        const columns = token.header.map((cell) =>
          cellText(cell.tokens).trim(),
        );
        if (
          columns.some((c) => !c || /^\d+$/.test(c)) ||
          new Set(columns).size !== columns.length
        )
          unsupported("empty, repeated or numeric-only table headings");
        if (columns.length > 6 || token.rows.length > 20)
          unsupported("tables larger than six columns or twenty rows");
        return placeholder({
          kind: "table",
          columns,
          data: token.rows.map((row) =>
            Object.fromEntries(
              columns.map((column, i) => [
                column,
                cellText(row[i]?.tokens ?? []),
              ]),
            ),
          ),
        });
      },
      image(token: Tokens.Image) {
        if (!token.text.trim())
          unsupported("images without descriptive alt text");
        return placeholder({
          kind: "image",
          url: token.href,
          alt: decode(token.text),
        });
      },
      paragraph(token: Tokens.Paragraph) {
        if (token.tokens.length === 1 && token.tokens[0]?.type === "image")
          return this.parser.parseInline(token.tokens);
        return `<p>${this.parser.parseInline(token.tokens)}</p>\n`;
      },
    },
  });
  const html = await parser.parse(markdown.trim());
  const body = await parse5ToStructuredText(parse(html), {
    handlers: {
      "growth-block": (createNode, node, context) => {
        if (context.parentNodeType !== "root")
          unsupported("tables or images nested in paragraphs, lists or quotes");
        if (node.type !== "element")
          throw new Error("Invalid block placeholder");
        return createNode("block", {
          item: `growth-block-${String(node.properties.dataIndex)}`,
        });
      },
    },
  });
  if (!body)
    throw new Error("Markdown conversion produced no structured text.");
  return { body, blocks };
}

export async function markdownToDatoStructuredText(
  markdown: string,
  options?: {
    resolveBlock: (block: BlogMarkdownBlock) => Promise<DatoMarkdownBlock>;
  },
) {
  const { body, blocks } = await prepareDatoMarkdown(markdown);
  const children = [];
  for (const node of body.document.children) {
    if (node.type !== "block") {
      children.push(node);
      continue;
    }
    const block = blocks[Number(node.item.replace("growth-block-", ""))];
    if (!block || !options)
      throw new Error(
        "This article needs the Dato table/image export adapter.",
      );
    children.push(await options.resolveBlock(block));
  }
  return { ...body, document: { ...body.document, children } };
}
