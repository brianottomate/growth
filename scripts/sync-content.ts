/**
 * Pull Wander's real published content (Zernio IG/FB/LinkedIn + X API) and
 * upsert it into platform_post. Idempotent — safe to re-run.
 *
 *   bun --conditions react-server scripts/sync-content.ts
 */
import { syncWanderContent } from "@/server/services/content-sync.service";

const result = await syncWanderContent();
console.log(JSON.stringify(result, null, 2));
process.exit(0);
