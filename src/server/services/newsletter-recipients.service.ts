import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import type { EmailRecipient } from "@/lib/email-personalization";
import { executeQuery } from "@/server/clients/bigquery.client";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";

const DATASET = "wander-9fc9c.wos_datastream";

/**
 * A WanderOS brand's guests as email recipients, read when the email goes
 * out: everyone with a confirmed, uncancelled booking on the brand's site,
 * and everyone who signed up there. One recipient per lowercased email,
 * because guest-checkout retries make a new WanderOS user each time.
 *
 * Not yet excluded: WanderOS's own marketing opt-outs (SaasGuestEmailOptOut),
 * which are not in BigQuery. A real send must drop them first; Postmark's
 * per-brand suppressions cover everyone who unsubscribes from Growth's email.
 */
export async function listBrandGuestRecipients(input: {
  brandId: string;
  orgId: string;
}): Promise<EmailRecipient[]> {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, input.brandId),
      eq(brandTable.organizationId, input.orgId),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand) throw new Error("Brand not found in this workspace.");
  if (!brand.wanderOsWebsiteId) {
    throw new Error(`${brand.name} has no WanderOS site to read guests from.`);
  }

  const rows = await executeQuery<{
    email: string;
    firstName: string | null;
    lastHome: string | null;
  }>(
    `
    WITH w AS (
      SELECT id, organizationId FROM \`${DATASET}.public_SaasWebsite\` WHERE id = @websiteId
    ),
    stays AS (
      SELECT b.primaryGuestId AS uid, b.checkOutDate,
        COALESCE(unit.siteName, unit.name) AS home
      FROM \`${DATASET}.public_v2Booking\` b
      JOIN w ON b.organizationId = w.organizationId
      LEFT JOIN \`${DATASET}.public_Unit\` unit ON unit.id = b.unitId
      WHERE b.channel = 'GENERATED_WEBSITE'
        AND b.confirmedAt IS NOT NULL
        AND b.cancelledAt IS NULL
    ),
    people AS (
      SELECT uid FROM stays
      UNION DISTINCT
      SELECT c.userId FROM \`${DATASET}.public_SaasWebsiteCustomers\` c
      JOIN w ON c.websiteId = w.id
    )
    SELECT LOWER(TRIM(u.email)) AS email,
      ANY_VALUE(NULLIF(TRIM(u.firstName), '')) AS firstName,
      ARRAY_AGG(
        IF(s.checkOutDate < CURRENT_TIMESTAMP(), s.home, NULL) IGNORE NULLS
        ORDER BY s.checkOutDate DESC LIMIT 1
      )[SAFE_OFFSET(0)] AS lastHome
    FROM people p
    JOIN \`${DATASET}.public_User\` u ON u.id = p.uid
    LEFT JOIN stays s ON s.uid = u.id
    WHERE u.email IS NOT NULL AND TRIM(u.email) != ''
    GROUP BY 1
    `,
    { websiteId: brand.wanderOsWebsiteId },
  );

  return rows.map((row) => ({
    email: row.email,
    first_name: row.firstName,
    last_home: row.lastHome,
  }));
}
