import type { AdContent } from "@/server/db/ads-schema";

export function exportFilename(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100) || "campaign"
  );
}

/** Quote copy literally, including newlines, and prevent spreadsheet formulas. */
export function adExportCsv(rows: (string | number)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            const text = String(value);
            return `"${/^[=+@-]|^[\t\r]/.test(text) ? "'" : ""}${text.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n")
  );
}

export function exportAdCopy(content: AdContent, landingUrl: string | null) {
  if ("headlines" in content)
    return {
      headline: content.headlines.join("\n"),
      body: content.descriptions.join("\n"),
      description: "",
      callToAction: "",
      linkUrl: content.linkUrl || landingUrl || "",
    };
  const copy = content.ideaStudio?.document.copy ?? content;
  return {
    headline: copy.headline,
    body: copy.body,
    description: copy.description ?? "",
    callToAction: copy.callToAction ?? "",
    linkUrl: copy.linkUrl || landingUrl || "",
  };
}
