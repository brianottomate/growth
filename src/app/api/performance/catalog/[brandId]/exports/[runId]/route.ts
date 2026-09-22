import ExcelJS from "exceljs";
import { getSession } from "@/server/better-auth/server";
import { catalogExport } from "@/server/services/catalog-studio.service";
import { hotelFeedXml } from "@/lib/meta-hotel-feed";
import {
  catalogFeedCells,
  CATALOG_FEED_COLUMNS,
  catalogFeedCsv,
} from "@/lib/catalog-studio";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ brandId: string; runId: string }> },
) {
  const session = await getSession();
  if (!session?.user)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { brandId, runId } = await params;
    const snapshot = await catalogExport(session.user.id, brandId, runId);
    const format = new URL(request.url).searchParams.get("format") ?? "csv";
    const filename = `catalog-${runId}.${format}`;
    const headers = {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    };
    if (format === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Hotels");
      sheet.addRow([...CATALOG_FEED_COLUMNS]);
      for (const row of snapshot.rows) sheet.addRow(catalogFeedCells(row));
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.columns.forEach((column) => {
        column.width = 28;
      });
      const buffer = await workbook.xlsx.writeBuffer();
      return new Response(new Uint8Array(buffer), {
        headers: {
          ...headers,
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      });
    }
    if (format === "xml")
      return new Response(hotelFeedXml(snapshot.rows, "Catalog"), {
        headers: { ...headers, "Content-Type": "application/xml" },
      });
    return new Response(catalogFeedCsv(snapshot.rows), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Export unavailable" },
      { status: 400 },
    );
  }
}
