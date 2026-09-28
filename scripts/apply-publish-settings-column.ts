/**
 * Additive column for per-spot Zernio publish options (Reel cover, trial
 * Reels, collaborators, Facebook Reel title).
 *
 *   bun --conditions=react-server scripts/apply-publish-settings-column.ts
 */
import { sql } from "drizzle-orm";

import { db } from "@/server/db";

await db.execute(sql`
  alter table public.platform_post
    add column if not exists publish_settings jsonb
`);

console.log("platform_post.publish_settings ready");
process.exit(0);
