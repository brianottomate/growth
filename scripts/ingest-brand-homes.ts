/**
 * Give every listing on a brand's WanderOS feed a `home` row with its full
 * gallery, amenities and description. Rerunnable; never touches the hero,
 * `featured` or catalog overrides.
 *
 *   bun --conditions=react-server scripts/ingest-brand-homes.ts <brandId> [listingId ...]
 *
 * Name listing ids to run a canary on just those homes.
 */
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { ingestBrandHomes } from "@/server/services/homes.service";

const [brandId, ...only] = process.argv.slice(2);
if (!brandId)
  throw new Error("Usage: ingest-brand-homes.ts <brandId> [listingId ...]");

const brand = await db.query.brandTable.findFirst({
  where: eq(brandTable.id, brandId),
  columns: { id: true, name: true, website: true },
});
if (!brand) throw new Error(`No brand ${brandId}`);

const result = await ingestBrandHomes({
  brandId: brand.id,
  website: brand.website,
  only: only.length ? only : undefined,
});
console.log(JSON.stringify({ brand: brand.name, ...result }, null, 2));
process.exit(0);
