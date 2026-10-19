import { expect, test } from "bun:test";
import { emailPreviewPrintDocument } from "./email-preview-print";

test("PDF print source retains every edition and all content below the interactive viewport", () => {
  const html = emailPreviewPrintDocument({
    brandName: "Demo <script>",
    editions: [0, 1].map((index) => ({
      id: String(index),
      subject: `Edition ${index + 1}`,
      preheader: null,
      series: null,
      plannedAt: null,
      html: `<html><head><style>p{color:black}</style></head><body><p>Start ${index}</p>${"<p>Long email body</p>".repeat(80)}<p>Final paragraph ${index}</p></body></html>`,
    })),
  });
  expect(html).toContain("Edition 1");
  expect(html).toContain("Edition 2");
  expect(html).toContain("Final paragraph 0");
  expect(html).toContain("Final paragraph 1");
  expect(html).not.toContain("<iframe");
  expect(html).not.toContain("<script>");
  expect(html).toContain("Demo &lt;script&gt;");
  expect(html).toContain("break-before:page");
});
