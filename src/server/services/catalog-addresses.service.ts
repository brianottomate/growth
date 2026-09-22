import "server-only";
import { executeQuery } from "@/server/clients/bigquery.client";
import {
  enrichCatalogAddresses,
  type CatalogAddress,
} from "@/lib/catalog-addresses";
import type { CatalogHome } from "@/lib/catalog-studio";

// Look up only the live website homes selected for this export. Website
// membership is established by startCatalogExport, not a warehouse flag.
export const CATALOG_ADDRESSES_QUERY = `
CREATE TEMP FUNCTION clean(s STRING) AS (
  CASE WHEN s IS NULL OR LOWER(TRIM(s)) IN
    ('', 'n/a', 'na', 'unknown', 'null', 'none', '-', 'not available')
  THEN NULL ELSE TRIM(s) END
);
SELECT
  CAST(u.id_unit AS STRING) AS homeId,
  clean(a.address_line1) AS streetAddress,
  clean(a.address_line2) AS streetAddress2,
  clean(a.address_line3) AS streetAddress3,
  clean(a.locality) AS city,
  clean(a.region) AS state,
  clean(a.postal_code) AS postalCode,
  UPPER(clean(a.country_code)) AS country,
  a.latitude,
  a.longitude
FROM \`wander-9fc9c.wos_datastream_production.stg_wos_datastream__unit\` AS u
LEFT JOIN \`wander-9fc9c.analytics.stg_propertydb__effective_address\` AS a
  ON u.id_new_pk = a.id_property
WHERE CAST(u.id_unit AS STRING) IN UNNEST(@homeIds)
  AND u.ts_archived IS NULL
`;

export async function fetchCatalogAddresses(homes: CatalogHome[]) {
  if (!homes.length) return homes;
  const addresses = await executeQuery<CatalogAddress>(
    CATALOG_ADDRESSES_QUERY,
    { homeIds: homes.map((home) => home.id) },
    { homeIds: ["STRING"] },
  );
  return enrichCatalogAddresses(homes, addresses);
}
