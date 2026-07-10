/**
 * Seed/refresh the `ad_account` allowlist registry (default-deny).
 *
 * Rows below reflect the 2026-07-10 Zernio probe of the metaads connection
 * (subscribedAdAccountIds had SIX accounts because the connection was
 * OAuth'd via a personal Facebook login). Explicit isAllowed=false rows keep
 * the denials self-documenting. Idempotent (upsert on platform+externalId).
 *
 * Run: bun --conditions react-server scripts/seed-ad-accounts.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import { adAccountTable } from "@/server/db/schema";

const ROWS: Array<{
  platform: string;
  externalId: string;
  name: string | null;
  isAllowed: boolean;
  note: string;
}> = [
  // ---- Wander (allowed) ----
  {
    platform: "facebook",
    externalId: "act_885632589057558",
    name: "Wander",
    isAllowed: true,
    note: "Main consumer Meta account — the spend tracker's META_AD_ACCOUNT_ID scope",
  },
  {
    platform: "facebook",
    externalId: "act_770182659373783",
    name: "Wander - Sites",
    isAllowed: true,
    note: "WanderOS Sites ad account",
  },
  {
    platform: "facebook",
    externalId: "act_25178656948455284",
    name: "Wander - Supply",
    isAllowed: true,
    note: "Supply-side ad account",
  },
  {
    platform: "twitter",
    externalId: "6p848z",
    name: "Wander",
    isAllowed: true,
    note: "X ads account (xads Zernio connection)",
  },
  // ---- Foreign / unidentified (denied) ----
  {
    platform: "facebook",
    externalId: "act_1877763863159956",
    name: "Homi",
    isAllowed: false,
    note: "Kristian's personal project — leaked into the Zernio connection via personal FB OAuth (probe 2026-07-10); Zernio /ads/tree ignores its own scope filter",
  },
  {
    platform: "facebook",
    externalId: "act_194844015",
    name: "Kristian Elset Bø",
    isAllowed: false,
    note: "Kristian's personal ad account — leaked via personal FB OAuth (identified from tree data 2026-07-10)",
  },
  {
    platform: "facebook",
    externalId: "act_720886265583419",
    name: "Holaplex",
    isAllowed: false,
    note: "Foreign (Kristian-adjacent) ad account — leaked via personal FB OAuth (identified from tree data 2026-07-10)",
  },
];

for (const row of ROWS) {
  await db
    .insert(adAccountTable)
    .values(row)
    .onConflictDoUpdate({
      target: [adAccountTable.platform, adAccountTable.externalId],
      set: {
        name: row.name,
        isAllowed: row.isAllowed,
        note: row.note,
        updatedAt: sql`now()`,
      },
    });
  console.log(
    `${row.isAllowed ? "✅ allow" : "⛔ deny "} ${row.platform}/${row.externalId} (${row.name ?? "?"})`,
  );
}

const all = await db.select().from(adAccountTable);
console.log(`\nRegistry now has ${all.length} rows.`);
process.exit(0);
