import type { EmailClientPreview } from "@/lib/email-client-preview";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
/** The print document contains the same complete rendered emails, without iframe viewport clipping. */
export function emailPreviewPrintDocument(
  preview: Pick<EmailClientPreview, "brandName" | "editions">,
) {
  const styles = preview.editions
    .map(
      (edition) =>
        /<head[^>]*>([\s\S]*?)<\/head>/i.exec(edition.html)?.[1] ?? "",
    )
    .join("\n");
  const editions = preview.editions
    .map((edition, i) => {
      const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(edition.html)?.[1];
      if (body === undefined)
        throw new Error("Email render has no printable body.");
      return `<section class="review-edition"><header class="review-heading"><p>${escape(preview.brandName)} · Email ${i + 1} of ${preview.editions.length}</p><h1>${escape(edition.subject)}</h1><p>${escape(edition.preheader ?? "")}</p><small>Creative preview · dates are tentative · exported ${escape(new Date().toISOString().slice(0, 10))}</small></header>${body}</section>`;
    })
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${escape(preview.brandName)} — email creative review</title>${styles}<style>body{margin:0;background:#fff;font-family:Arial,sans-serif}.review-edition{max-width:720px;margin:24px auto 48px}.review-heading{padding:16px 24px;color:#222}.review-heading p{font-size:12px;color:#666}.review-heading h1{font-size:22px;line-height:1.3}.review-heading small{font-size:10px;color:#666}.print-controls{padding:16px;text-align:center}.print-controls button{border:1px solid #ddd;border-radius:8px;padding:10px 18px;background:#fff;cursor:pointer}@page{size:A4;margin:12mm}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.print-controls{display:none}.review-edition{max-width:none;margin:0;break-before:page;zoom:0.9}tr:has(> .wd-grid-cell),table:has(> tbody > tr > td > a > img){break-inside:avoid;page-break-inside:avoid}.review-edition:first-of-type{break-before:auto}.review-heading{break-inside:avoid;break-after:avoid}img{max-width:100%!important;max-height:75mm!important;width:auto!important;height:auto!important;object-fit:contain;margin-left:auto!important;margin-right:auto!important}h1,h2,h3{break-after:avoid}p{orphans:3;widows:3}}</style></head><body><div class="print-controls"><button onclick="window.print()">Print / Save as PDF</button><p>The PDF contains all ${preview.editions.length} selected emails, including content below the preview viewport.</p></div>${editions}</body></html>`;
}
