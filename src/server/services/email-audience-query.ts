import type { EmailAudienceDefinition } from "@/lib/email-audience";

const CIO = "wander-9fc9c.customer_io";
const WOS = "wander-9fc9c.wos_datastream";

export function buildEmailAudienceQuery(
  definition: EmailAudienceDefinition,
  websiteId: string | null,
) {
  if (definition.source === "wander_cio")
    return {
      params: {
        workspaceId: 142511,
        ...(definition.clickedWithinDays
          ? { clickDays: definition.clickedWithinDays }
          : {}),
      },
      sql: `WITH people AS (
      SELECT * FROM \`${CIO}.people\` WHERE workspace_id = @workspaceId
      QUALIFY ROW_NUMBER() OVER (PARTITION BY internal_customer_id ORDER BY _version DESC, updated_at DESC) = 1
    ), attributes AS (
      SELECT internal_customer_id, attribute_name, attribute_value FROM \`${CIO}.attributes\`
      WHERE workspace_id = @workspaceId AND attribute_name IN ('unsubscribed','first_name')
      QUALIFY ROW_NUMBER() OVER (PARTITION BY internal_customer_id, attribute_name ORDER BY timestamp DESC, _version DESC) = 1
    ), flags AS (
      SELECT internal_customer_id,
        MAX(IF(attribute_name='unsubscribed', LOWER(TRIM(attribute_value, '"')), NULL)) AS unsubscribed,
        MAX(IF(attribute_name='first_name', attribute_value, NULL)) AS first_name
      FROM attributes GROUP BY 1
    )${
      definition.clickedWithinDays
        ? `, clicks AS (
      SELECT DISTINCT d.internal_customer_id FROM \`${CIO}.metrics\` m
      JOIN \`${CIO}.deliveries\` d ON m.delivery_id=d.delivery_id AND d.workspace_id=@workspaceId
      WHERE m.workspace_id=@workspaceId AND m.metric='clicked'
        AND m.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @clickDays DAY)
        AND COALESCE(m.machine,FALSE)=FALSE AND COALESCE(m.prefetched,FALSE)=FALSE
    )`
        : ""
    }
    SELECT LOWER(TRIM(p.email_addr)) AS email,
      MAX(NULLIF(TRIM(f.first_name),'')) AS first_name,
      MIN(p.internal_customer_id) AS source_id,
      '${definition.clickedWithinDays ? "Recent non-machine email click" : "Customer.io subscriber candidate"}' AS reason
    FROM people p LEFT JOIN flags f USING (internal_customer_id)
    WHERE p.email_addr IS NOT NULL AND REGEXP_CONTAINS(TRIM(p.email_addr), r'^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$')
    GROUP BY email
    HAVING NOT LOGICAL_OR(COALESCE(p.deleted, FALSE) OR COALESCE(p.suppressed,FALSE) OR COALESCE(f.unsubscribed='true',FALSE))
      ${definition.clickedWithinDays ? `AND COUNTIF(p.internal_customer_id IN (SELECT internal_customer_id FROM clicks)) > 0` : ""}`,
    };
  return {
    params: { websiteId: websiteId! },
    sql: `WITH website AS (SELECT id, organizationId FROM \`${WOS}.public_SaasWebsite\` WHERE id=@websiteId),
    candidates AS (
      ${definition.guestKinds.includes("bookers") ? `SELECT b.primaryGuestId AS uid, 'Past or confirmed guest' AS reason FROM \`${WOS}.public_v2Booking\` b JOIN website w ON b.organizationId=w.organizationId AND b.websiteId=w.id WHERE b.channel='GENERATED_WEBSITE' AND b.confirmedAt IS NOT NULL AND b.cancelledAt IS NULL` : "SELECT CAST(NULL AS STRING) uid, '' reason WHERE FALSE"}
      ${definition.guestKinds.includes("signups") ? `UNION ALL SELECT c.userId uid, 'Website signup' reason FROM \`${WOS}.public_SaasWebsiteCustomers\` c JOIN website w ON c.websiteId=w.id` : ""}
    ) SELECT LOWER(TRIM(u.email)) email, MAX(NULLIF(TRIM(u.firstName),'')) first_name,
      MIN(u.id) source_id, STRING_AGG(DISTINCT c.reason, ', ') reason
    FROM candidates c JOIN \`${WOS}.public_User\` u ON u.id=c.uid
    WHERE u.email IS NOT NULL AND REGEXP_CONTAINS(TRIM(u.email), r'^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$') GROUP BY email`,
  };
}
