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
import { eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { adAccountTable, brandTable } from "@/server/db/schema";

const ROWS: Array<{
  platform: string;
  externalId: string;
  name: string | null;
  isAllowed: boolean;
  note: string;
  brandSlug: string | null;
}> = [
  // ---- Wander (allowed) ----
  {
    platform: "facebook",
    externalId: "act_885632589057558",
    name: "Wander",
    isAllowed: true,
    brandSlug: "wander",
    note: "Main consumer Meta account — the spend tracker's META_AD_ACCOUNT_ID scope",
  },
  {
    platform: "facebook",
    externalId: "act_770182659373783",
    name: "Wander - Sites",
    isAllowed: true,
    brandSlug: "wanderos",
    note: "WanderOS Sites ad account",
  },
  {
    platform: "facebook",
    externalId: "act_25178656948455284",
    name: "Wander - Supply",
    isAllowed: true,
    brandSlug: "wanderos",
    note: "Supply-side ad account",
  },
  {
    platform: "google",
    externalId: "3254449027",
    name: "Wander - Demand",
    isAllowed: true,
    brandSlug: "wander",
    note: "Guest booking side (wander.com marketplace); enumerated via Zernio googleads connection 2026-07-13",
  },
  {
    platform: "google",
    externalId: "1808032462",
    name: "Wander - Sites",
    isAllowed: true,
    brandSlug: "wanderos",
    note: "Under MCC 1520642156; enumerated via Zernio googleads connection 2026-07-13",
  },
  {
    platform: "google",
    externalId: "9709781352",
    name: "Wander - Supply",
    isAllowed: true,
    brandSlug: "wanderos",
    note: "Host/PM acquisition (WanderOS); enumerated via Zernio googleads connection 2026-07-13",
  },
  {
    platform: "twitter",
    externalId: "6p848z",
    name: "Wander",
    isAllowed: true,
    brandSlug: "wander",
    note: "X ads account (xads Zernio connection)",
  },
  // ---- Foreign / unidentified (denied) ----
  {
    platform: "facebook",
    externalId: "act_1877763863159956",
    name: "Homi",
    isAllowed: false,
    brandSlug: null,
    note: "Kristian's personal project — leaked into the Zernio connection via personal FB OAuth (probe 2026-07-10); Zernio /ads/tree ignores its own scope filter",
  },
  {
    platform: "facebook",
    externalId: "act_194844015",
    name: "Kristian Elset Bø",
    isAllowed: false,
    brandSlug: null,
    note: "Kristian's personal ad account — leaked via personal FB OAuth (identified from tree data 2026-07-10)",
  },
  {
    platform: "facebook",
    externalId: "act_720886265583419",
    name: "Holaplex",
    isAllowed: false,
    brandSlug: null,
    note: "Foreign (Kristian-adjacent) ad account — leaked via personal FB OAuth (identified from tree data 2026-07-10)",
  },
  {
    platform: "google",
    externalId: "8794770768",
    name: "Wander Travel Ads Test Account",
    isAllowed: false,
    brandSlug: null,
    note: "Test account under MCC 1520642156 — excluded from analytics; flip if ever needed",
  },
];

for (const row of ROWS) {
  const brand = row.brandSlug
    ? await db.query.brandTable.findFirst({
        where: eq(brandTable.slug, row.brandSlug),
        columns: { id: true },
      })
    : null;
  if (row.isAllowed && !brand) {
    throw new Error(
      `Owned brand not found for allowed account: ${row.brandSlug}`,
    );
  }
  await db
    .insert(adAccountTable)
    .values({
      platform: row.platform,
      externalId: row.externalId,
      name: row.name,
      isAllowed: row.isAllowed,
      note: row.note,
      brandId: brand?.id ?? null,
    })
    .onConflictDoUpdate({
      target: [adAccountTable.platform, adAccountTable.externalId],
      set: {
        name: row.name,
        isAllowed: row.isAllowed,
        note: row.note,
        brandId: brand?.id ?? null,
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
