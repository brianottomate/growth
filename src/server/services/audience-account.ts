import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { adAccountTable } from "@/server/db/schema";

/** The allowlist registry owns destination identity; provider JSON is provenance. */
export async function requireMetaAudienceAccount(asset: {
  adAccountId: string | null;
  brandId: string;
}) {
  if (!asset.adAccountId)
    throw new Error(
      "Refresh audiences to record this asset's ad-account ownership before using it",
    );
  const account = await db.query.adAccountTable.findFirst({
    where: and(
      eq(adAccountTable.id, asset.adAccountId),
      eq(adAccountTable.brandId, asset.brandId),
      eq(adAccountTable.platform, "facebook"),
      eq(adAccountTable.isAllowed, true),
    ),
  });
  if (!account)
    throw new Error(
      "The audience's ad account is no longer allowlisted for this brand",
    );
  return account;
}
