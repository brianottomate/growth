import sanitizeHtml from "sanitize-html";
import { parse } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";

/** Inert HTML for a same-origin capture frame; scripts, forms and navigation stay blocked. */
export function newsletterCaptureHtml(html: string) {
  const clean = sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "html",
      "head",
      "body",
      "style",
      "img",
      "center",
    ],
    allowedAttributes: {
      "*": [
        "style",
        "class",
        "id",
        "align",
        "valign",
        "width",
        "height",
        "bgcolor",
        "dir",
        "lang",
      ],
      a: ["href", "title"],
      img: ["src", "alt", "width", "height"],
      table: ["cellpadding", "cellspacing", "border", "role"],
      td: ["colspan", "rowspan"],
    },
    allowedSchemes: ["https", "http", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https", "http", "data"] },
    transformTags: {
      img: (tagName, attribs) => {
        // Historical CIO templates expose Liquid rather than a recipient render.
        // Use only explicit image defaults; never invent guest values.
        const fallback = attribs.src?.match(
          /\{\{[^}]*\|\s*default:\s*['"]([^'"]+)['"]\s*\}\}/,
        );
        return {
          tagName,
          attribs: { ...attribs, src: fallback?.[1] ?? attribs.src ?? "" },
        };
      },
    },
    allowVulnerableTags: true,
  });
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; font-src https: http: data:; base-uri 'none'; form-action 'none'">${clean}`;
}

/** Copy and destinations are preserved independently of visual capture, including the footer. */
export function newsletterReviewCopy(html: string) {
  const lines: string[] = [];
  const walk = (node: DefaultTreeAdapterMap["node"]) => {
    if (
      "tagName" in node &&
      ["script", "style", "noscript", "head"].includes(node.tagName)
    )
      return;
    if ("value" in node) lines.push(node.value);
    if ("childNodes" in node) node.childNodes.forEach(walk);
    if ("tagName" in node) {
      const attr = (key: string) =>
        node.attrs.find((a) => a.name === key)?.value;
      if (node.tagName === "a" && attr("href"))
        lines.push(` (${attr("href")})`);
      if (node.tagName === "img" && attr("alt"))
        lines.push(` [Image: ${attr("alt")}]`);
      if (
        ["p", "div", "tr", "li", "br", "h1", "h2", "h3"].includes(node.tagName)
      )
        lines.push("\n");
    }
  };
  walk(parse(html));
  return lines
    .join(" ")
    .replace(/[\u200B-\u200F\uFEFF\u034F\u00AD]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
