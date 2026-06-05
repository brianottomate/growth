/**
 * Dev helper: drop the growth-domain tables + enums so `db:push` recreates them
 * cleanly (avoids drizzle-kit's interactive rename prompts during iteration).
 * Leaves Better Auth / org / attachment tables untouched.
 *
 *   bun run scripts/reset-growth.ts
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");

const sql = postgres(url);

const tables = [
  "campaign",
  "audience",
  "platform_post",
  "content_post",
  "post", // legacy demo table
  "access",
  "brand_inspiration",
  "channel",
  "brand",
];
const types = [
  "campaign_status",
  "audience_type",
  "content_status",
  "content_origin",
  "platform_post_source",
  "channel_kind",
  "channel_platform",
  "connection_status",
  "delivery_provider",
  "brand_type",
  "inspiration_purpose",
  "access_role",
  "access_subject_type",
];

for (const t of tables) await sql.unsafe(`DROP TABLE IF EXISTS "${t}" CASCADE`);
for (const ty of types) await sql.unsafe(`DROP TYPE IF EXISTS "${ty}" CASCADE`);

await sql.end();
console.log("✓ dropped growth tables + enums");
process.exit(0);
