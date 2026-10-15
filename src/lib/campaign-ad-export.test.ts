import { expect, test } from "bun:test";
import { adExportCsv, exportFilename } from "./campaign-ad-export";

test("downloaded copy stays literal when opened in a spreadsheet", () => {
  expect(
    adExportCsv([
      [
        '=HYPERLINK("https://example.com")',
        'Line one\nLine "two"',
        "+1",
        "@SUM(1)",
      ],
    ]),
  ).toBe(
    '\uFEFF"\'=HYPERLINK(""https://example.com"")","Line one\nLine ""two""","\'+1","\'@SUM(1)"',
  );
});

test("operator names cannot create paths outside the campaign ZIP folder", () => {
  expect(exportFilename('../../A home/..\\other\r\n"name')).toBe(
    "A-home-other-name",
  );
});
