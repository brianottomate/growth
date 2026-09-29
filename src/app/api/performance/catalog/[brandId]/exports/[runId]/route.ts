import ExcelJS from "exceljs";
import { getSession } from "@/server/better-auth/server";
import { catalogExport } from "@/server/services/catalog-studio.service";
import {
  HOTEL_FEED_COLUMNS,
  hotelFeedCells,
  hotelFeedCsv,
  hotelFeedXml,
} from "@/lib/meta-hotel-feed";
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
    // hollyhock-suites-hotel-catalog-square-2026-09-29-2339.csv
    const stamp = snapshot.createdAt
      .toISOString()
      .slice(0, 16)
      .replace("T", "-")
      .replace(":", "");
    const filename = `${snapshot.brand.slug ?? snapshot.brand.id}-hotel-catalog-${snapshot.formats.join("-")}-${stamp}.${format}`;
    const headers = {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    };
    if (format === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Hotels");
      sheet.addRow([...HOTEL_FEED_COLUMNS]);
      for (const row of snapshot.rows) sheet.addRow(hotelFeedCells(row));
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
      return new Response(hotelFeedXml(snapshot.rows, snapshot.brand.name), {
        headers: { ...headers, "Content-Type": "application/xml" },
      });
    return new Response(hotelFeedCsv(snapshot.rows), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Export unavailable" },
      { status: 400 },
    );
  }
}
