/**
 * End-to-end: discover → verify → persist social-handle suggestions for a brand.
 *
 *   bun run scripts/discover-peer-handles.ts            # Airbnb
 *   bun run scripts/discover-peer-handles.ts Vrbo
 *   bun run scripts/discover-peer-handles.ts --no-verify Outsite
 */

import { ilike } from "drizzle-orm";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { discoverAndSaveSuggestions } from "@/server/services/social-discovery.service";

async function main() {
  const args = process.argv.slice(2);
  const verify = !args.includes("--no-verify");
  const name = args.find((a) => !a.startsWith("--")) ?? "Airbnb";

  const brand = await db.query.brandTable.findFirst({
    where: ilike(brandTable.name, name),
  });
  if (!brand) {
    console.log(`Brand "${name}" not found.`);
    process.exit(1);
  }

  console.log(`Discovering handles for ${brand.name} (${brand.website ?? "no site"}) — verify=${verify}\n`);
  const r = await discoverAndSaveSuggestions(brand.id, { verify });

  console.log(`discovered=${r.discovered} inserted=${r.inserted} updated=${r.updated} skippedRejected=${r.skippedRejected} verified=${r.verified}\n`);
  console.log("=== pending suggestions (channel_suggestion) ===");
  for (const s of r.suggestions.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))) {
    const ver =
      s.verified == null ? "—" : s.verified ? `✓ ${s.followerCount?.toLocaleString() ?? "?"} followers` : "✗ unresolved";
    console.log(`  ${s.platform.padEnd(10)} @${s.handle.padEnd(22)} ${((s.confidence ?? 0) * 100).toFixed(0)}%  ${ver}`);
    console.log(`      ${s.profileUrl}  [${(s.sources ?? []).join(", ")}]`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
