/**
 * Retroactive content grouping — AI clusters a brand's posts into content
 * ideas/series, written as PENDING content_suggestion(kind="grouping") rows for
 * review at /app/content/groupings.
 *
 *   bun --conditions react-server scripts/suggest-groupings.ts <slug> [platforms] [source]
 *   e.g. bun --conditions react-server scripts/suggest-groupings.ts wander blog,newsletter owned
 */
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, type ChannelPlatform } from "@/server/db/schema";
import { suggestGroupingsForBrand } from "@/server/services/content-grouping.service";

const slug = process.argv[2] ?? "wander";
const platforms = (process.argv[3] ?? "blog,newsletter").split(
  ",",
) as ChannelPlatform[];
const source = (process.argv[4] ?? "owned") as "owned" | "scraped";

const [brand] = await db
  .select({ id: brandTable.id, name: brandTable.name })
  .from(brandTable)
  .where(eq(brandTable.slug, slug))
  .limit(1);
if (!brand) {
  console.error(`no brand with slug "${slug}"`);
  process.exit(1);
}

console.log(
  `Grouping ${brand.name} · platforms=${platforms.join(",")} · source=${source}`,
);
const result = await suggestGroupingsForBrand({
  brandId: brand.id,
  platforms,
  source,
});
console.log("Result:", result);
process.exit(0);
