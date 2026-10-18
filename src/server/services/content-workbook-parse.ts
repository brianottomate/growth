import "server-only";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { inflateRawSync } from "node:zlib";
import {
  workbookSourceSchema,
  workbookDocumentSchema,
  type WorkbookRow,
} from "@/lib/content-workbook";
import type { z } from "zod";
const aliases: Record<string, string> = {
  title: "title",
  idea: "title",
  concept: "title",
  topic: "title",
  caption: "caption",
  copy: "caption",
  text: "caption",
  platform: "platform",
  channel: "platform",
  format: "format",
  date: "date",
  publishdate: "date",
  scheduleddate: "date",
  pillar: "pillar",
  series: "seriesId",
  seriesid: "seriesId",
  owner: "ownerId",
  ownerid: "ownerId",
  assignee: "ownerId",
  hook: "hook",
  visualdirection: "visualDirection",
  visuals: "visualDirection",
  cta: "cta",
  keyword: "keyword",
  manychatkeyword: "keyword",
  kpi: "kpi",
  ideakey: "ideaKey",
  group: "ideaKey",
  slotid: "slotId",
};
// Bound decompression before ExcelJS materializes uploaded XML and shared strings.
function checkedXlsxBytes(data: string) {
  const bytes = Buffer.from(data, "base64");
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > bytes.length)
    throw new Error("Invalid XLSX archive.");
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  let remaining = 12_000_000;
  if (count > 1000) throw new Error("Workbook archive has too many entries.");
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50)
      throw new Error("Invalid XLSX directory.");
    const compressed = bytes.readUInt32LE(offset + 20);
    const local = bytes.readUInt32LE(offset + 42);
    const method = bytes.readUInt16LE(offset + 10);
    if (
      bytes.readUInt16LE(offset + 8) & 1 ||
      local + 30 > bytes.length ||
      bytes.readUInt32LE(local) !== 0x04034b50
    )
      throw new Error("Unsupported XLSX archive.");
    const start =
      local +
      30 +
      bytes.readUInt16LE(local + 26) +
      bytes.readUInt16LE(local + 28);
    if (start + compressed > bytes.length || remaining <= 0)
      throw new Error("Workbook archive is too large or invalid.");
    const chunk = bytes.subarray(start, start + compressed);
    if (method === 0) remaining -= chunk.length;
    else if (method === 8)
      remaining -= inflateRawSync(chunk, { maxOutputLength: remaining }).length;
    else throw new Error("Unsupported XLSX compression.");
    if (remaining < 0) throw new Error("Workbook expands beyond 12 MB.");
    offset +=
      46 +
      bytes.readUInt16LE(offset + 28) +
      bytes.readUInt16LE(offset + 30) +
      bytes.readUInt16LE(offset + 32);
  }
  return Uint8Array.from(bytes).buffer;
}
export async function parseContentWorkbook(
  input: z.infer<typeof workbookSourceSchema>,
) {
  const source = workbookSourceSchema.parse(input);
  let cells: string[][];
  let sheet: string | null = null;
  if (source.kind === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(checkedXlsxBytes(source.data));
    const selected = source.sheet
      ? workbook.getWorksheet(source.sheet)
      : workbook.worksheets[0];
    if (!selected) throw new Error("Worksheet not found.");
    sheet = selected.name;
    if (selected.rowCount > 201 || selected.columnCount > 40)
      throw new Error(
        "Use a worksheet with at most 200 content rows and 40 columns.",
      );
    cells = [];
    selected.eachRow({ includeEmpty: true }, (row) => {
      const values: string[] = [];
      for (let col = 1; col <= selected.columnCount; col++) {
        const cell = row.getCell(col);
        if (cell.type === ExcelJS.ValueType.Formula)
          throw new Error(
            `Replace the formula in ${cell.address} with a value before importing.`,
          );
        values.push(
          cell.value instanceof Date
            ? cell.value.toISOString().slice(0, 10)
            : cell.text,
        );
      }
      cells.push(values);
    });
  } else {
    cells = parse(source.data, {
      delimiter: source.kind === "tsv" ? "\t" : ",",
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      max_record_size: 100000,
    });
  }
  if (
    cells.length < 2 ||
    cells.length > 201 ||
    cells.some((r) => r.length > 40)
  )
    throw new Error(
      "Include a header and 1–200 rows, with at most 40 columns.",
    );
  if (JSON.stringify(cells).length > 2_000_000)
    throw new Error("Workbook text exceeds 2 MB.");
  if (cells.some((r) => r.slice(cells[0]!.length).some((v) => v.trim())))
    throw new Error(
      "Some values have no column header. Add a header for each column.",
    );
  const headers = cells[0]!.map(
    (h) => aliases[h.toLowerCase().replace(/[^a-z0-9]/g, "")],
  );
  if (!headers.includes("title"))
    throw new Error("Include a Title, Idea, Concept or Topic column.");
  const known = headers.filter(Boolean);
  if (new Set(known).size !== known.length)
    throw new Error(
      "Use one column per field; duplicate mapped headers were found.",
    );
  const warnings = cells[0]!.flatMap((h, i) =>
    headers[i]
      ? []
      : [`Unmapped column retained in source: ${h || `column ${i + 1}`}`],
  );
  const rows: WorkbookRow[] = cells.slice(1).flatMap((values, index) => {
    if (values.every((v) => !v.trim())) return [];
    const row: WorkbookRow = {
      sourceRow: index + 2,
      include: true,
      ideaKey: `row-${index + 2}`,
      title: "",
      caption: "",
      platform: "",
      format: "",
      date: "",
      pillar: "",
      seriesId: "",
      ownerId: "",
      slotId: "",
      hook: "",
      visualDirection: "",
      cta: "",
      keyword: "",
      kpi: "",
    };
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i];
      if (key && values[i])
        (row as unknown as Record<string, unknown>)[key] = values[i];
    }
    row.platform =
      (
        {
          ig: "instagram",
          twitter: "x",
          fb: "facebook",
          li: "linkedin",
          yt: "youtube",
        } as Record<string, string>
      )[row.platform.toLowerCase().trim()] ?? row.platform.toLowerCase().trim();
    row.date = row.date.trim();
    if (row.date && !/^\d{4}-\d{2}-\d{2}$/.test(row.date))
      warnings.push(
        `Row ${row.sourceRow}: choose a date in YYYY-MM-DD format.`,
      );
    return [row];
  });
  return {
    source: { kind: source.kind, sheet, cells },
    document: workbookDocumentSchema.parse({ initiativeId: "", rows }),
    warnings,
  };
}
