/**
 * Pull one platform's ad campaigns from Zernio and upsert them into `campaign`.
 * Idempotent — safe to re-run (updates metrics in place). Campaigns are
 * filtered by platform + the default-deny ad-account allowlist.
 *
 *   bun --conditions react-server scripts/sync-ads.ts                     # meta_ads → wander
 *   bun --conditions react-server scripts/sync-ads.ts --platform google_ads --brand wander --account 3254449027
 *   bun --conditions react-server scripts/sync-ads.ts --platform google_ads --brand wanderos --account 9709781352
 */
import type { ChannelPlatform } from "@/server/db/channel-schema";
import { syncZernioAds } from "@/server/services/ads-sync.service";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const result = await syncZernioAds({
  brandSlug: arg("brand"),
  platform: arg("platform") as ChannelPlatform | undefined,
  adAccountId: arg("account"),
});
console.log(JSON.stringify(result, null, 2));
process.exit(0);
