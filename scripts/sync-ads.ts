/**
 * Pull Wander's Meta ad campaigns from Zernio and upsert them into `campaign`.
 * Idempotent — safe to re-run (updates metrics in place).
 *
 *   bun --conditions react-server scripts/sync-ads.ts
 */
import { syncZernioAds } from "@/server/services/ads-sync.service";

const result = await syncZernioAds();
console.log(JSON.stringify(result, null, 2));
process.exit(0);
