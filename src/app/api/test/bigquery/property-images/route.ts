import { NextResponse } from "next/server";
import { executeQuery } from "@/server/clients/bigquery.client";

interface PropertyImageRow {
  id_unit: string | null;
  property_name: string | null;
  image_type: string | null;
  full_res_image_url: string | null;
  image_order: number | null;
}

/**
 * Dedicated test endpoint for property image join query.
 *
 * GET /api/test/bigquery/property-images
 * GET /api/test/bigquery/property-images?limit=5
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedLimit = Number.parseInt(searchParams.get("limit") ?? "1", 10);
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 50)
      : 1;

  const sql = `
WITH properties AS (
  SELECT
    id_unit,
    property_name
  FROM \`wander-9fc9c.analytics.properties\`
  WHERE management = 'operated'
    AND is_bookable
    AND is_search_wander
    AND NOT is_search_website
  LIMIT @limit
)

SELECT
  properties.id_unit,
  properties.property_name,
  stg_wos__unit_images.image_type,
  stg_wos__unit_images.image_url AS full_res_image_url,
  stg_wos__unit_images.image_order
FROM properties
LEFT JOIN \`wander-9fc9c.analytics.stg_wos__unit_images\` stg_wos__unit_images
  ON properties.id_unit = stg_wos__unit_images.id_unit
ORDER BY properties.property_name, stg_wos__unit_images.image_order
`;

  try {
    const startMs = Date.now();
    const rows = await executeQuery<PropertyImageRow>(sql, { limit });
    const durationMs = Date.now() - startMs;

    return NextResponse.json({
      success: true,
      durationMs,
      limit,
      rowCount: rows.length,
      rows,
      usage: {
        default: "/api/test/bigquery/property-images",
        withLimit: "/api/test/bigquery/property-images?limit=5",
      },
    });
  } catch (error) {
    console.error("❌ [BQ Test Property Images] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
