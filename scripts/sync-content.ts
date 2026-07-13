/**
 * Pull one brand's published content (Zernio + X API) and upsert it into
 * platform_post. Idempotent — safe to re-run.
 *
 *   BRAND_SLUG=homi bun --conditions react-server scripts/sync-content.ts
 */
import { syncBrandContent } from "@/server/services/content-sync.service";

const brandSlug = process.env.BRAND_SLUG;
if (!brandSlug) throw new Error("Set BRAND_SLUG to the brand slug to sync");

const result = await syncBrandContent({ brandSlug });
console.log(JSON.stringify(result, null, 2));
process.exit(0);
