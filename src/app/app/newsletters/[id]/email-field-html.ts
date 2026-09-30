import { EMAIL_FIELDS } from "@/lib/email-personalization";

/** Field chips only replace prose. Link destinations can contain provider tokens. */
export function fieldHtml(html: string, direction: "chips" | "tokens") {
  const document = new DOMParser().parseFromString(html, "text/html");
  if (direction === "tokens") {
    document.querySelectorAll("span[data-field]").forEach((element) => {
      const field = element.getAttribute("data-field") ?? "";
      if (!Object.hasOwn(EMAIL_FIELDS, field)) return;
      const fallback = element.getAttribute("data-fallback") ?? "";
      element.replaceWith(
        document.createTextNode(
          `{{${field}${fallback ? `|${fallback}` : ""}}}`,
        ),
      );
    });
  } else {
    const visit = (parent: Node) => {
      for (const node of Array.from(parent.childNodes)) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          if (!element.matches("script, style, [data-field]")) visit(element);
        } else if (node.nodeType === Node.TEXT_NODE) {
          const source = node.textContent ?? "";
          const matches = [
            ...source.matchAll(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g),
          ].filter((match) => Object.hasOwn(EMAIL_FIELDS, match[1]!));
          if (!matches.length) continue;
          const fragment = document.createDocumentFragment();
          let offset = 0;
          for (const match of matches) {
            fragment.append(source.slice(offset, match.index));
            const span = document.createElement("span");
            span.setAttribute("data-field", match[1]!);
            span.setAttribute("data-fallback", match[2]?.trim() ?? "");
            fragment.append(span);
            offset = match.index + match[0].length;
          }
          fragment.append(source.slice(offset));
          parent.replaceChild(fragment, node);
        }
      }
    };
    visit(document.body);
  }
  return document.body.innerHTML;
}
