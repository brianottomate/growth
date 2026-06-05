/**
 * One-off: set real follower captures for the Wander brand's social channels
 * (numbers pulled from the live profiles on 2026-06-03). Replaces any seeded
 * placeholder history with a single accurate point-in-time capture.
 *
 *   bun run scripts/set-follower-counts.ts          # dry run (prints only)
 *   bun run scripts/set-follower-counts.ts --apply  # write
 */
import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/brand-schema";
import { channelTable } from "@/server/db/channel-schema";

const CAPTURED_AT = "2026-06-03";

// platform -> follower count as shown on the live profile
const COUNTS: Partial<Record<string, number>> = {
  instagram: 293_000,
  x: 19_300,
  tiktok: 25_100,
  facebook: 20_000,
  linkedin: 30_012,
  youtube: 6_020,
};

const apply = process.argv.includes("--apply");

const brand = await db.query.brandTable.findFirst({
  where: and(eq(brandTable.name, "Wander"), eq(brandTable.type, "company")),
});
if (!brand) throw new Error("Wander company brand not found");

const channels = await db
  .select()
  .from(channelTable)
  .where(eq(channelTable.brandId, brand.id));

for (const ch of channels) {
  const count = COUNTS[ch.platform];
  if (count == null) continue;
  const snapshot = { count, capturedAt: new Date(CAPTURED_AT).toISOString() };
  console.log(
    `${ch.platform.padEnd(10)} ${String(ch.handle ?? "").padEnd(12)} ` +
      `was=${ch.followerCount ?? "—"}  ->  ${count.toLocaleString()} @ ${CAPTURED_AT}`,
  );
  if (apply) {
    await db
      .update(channelTable)
      .set({ followerCount: count, followerHistory: [snapshot] })
      .where(eq(channelTable.id, ch.id));
  }
}

console.log(apply ? "\n✓ applied" : "\n(dry run — pass --apply to write)");
process.exit(0);
