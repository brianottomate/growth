/**
 * Remove demo/seed posts without touching real synced data.
 *
 *   bun run db:unseed
 *
 * Deletes every `content_post` / `platform_post` row with `is_seed = true`
 * (set by scripts/seed.ts). Real Zernio/X-synced rows insert with the column's
 * `false` default, so they survive. Brands, channels, org, and users are left
 * intact — only the demo content is removed.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");

const sql = postgres(url);

// platform_post first — it FKs content_post (onDelete set null, but delete the
// children explicitly so we don't orphan demo spots under a deleted idea).
const [pp] =
  await sql`DELETE FROM platform_post WHERE is_seed = true RETURNING 1`.then(
    (rows) => [rows.length],
  );
const [cp] =
  await sql`DELETE FROM content_post WHERE is_seed = true RETURNING 1`.then(
    (rows) => [rows.length],
  );

await sql.end();
console.log(`✓ unseeded: ${pp} platform_post, ${cp} content_post rows removed`);
process.exit(0);
