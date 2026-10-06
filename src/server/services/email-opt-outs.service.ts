import "server-only";
import { executeQuery } from "@/server/clients/bigquery.client";
import { listGuestEmailOptOuts } from "@/server/clients/wander.client";

/** Shared by blasts and sequences; inability to read consent fails closed. */
export async function websiteEmailOptOuts(websiteId: string) {
  const [row] = await executeQuery<{ organizationId: string }>(
    "SELECT organizationId FROM `wander-9fc9c.wos_datastream.public_SaasWebsite` WHERE id=@websiteId LIMIT 1",
    { websiteId },
  );
  if (!row?.organizationId)
    throw new Error(`WanderOS website ${websiteId} has no organization.`);
  return listGuestEmailOptOuts({
    organizationId: row.organizationId,
    websiteId,
  });
}
