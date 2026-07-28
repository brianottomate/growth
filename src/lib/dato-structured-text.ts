/** Plain text for analysis/search while keeping the UI renderer on native DAST. */
export function datoStructuredTextToPlainText(value: unknown): string {
  const parts: string[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.type === "span" && typeof record.value === "string") {
      parts.push(record.value);
    }
    if (record.document) visit(record.document);
    if (Array.isArray(record.children)) {
      visit(record.children);
      if (
        record.type === "paragraph" ||
        record.type === "heading" ||
        record.type === "listItem"
      ) {
        parts.push("\n");
      }
    }
  };
  visit(value);
  return parts
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
