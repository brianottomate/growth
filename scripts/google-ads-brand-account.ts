/**
 * Gives a brand its own Google Ads account under Wander's MCC, then its one
 * booking conversion. Dry-run (Google validateOnly, no DB writes) unless
 * --apply is passed. Needs the GOOGLE_ADS_* server credentials.
 *
 *   bun --conditions=react-server scripts/google-ads-brand-account.ts chalets-hh [--apply]
 */
import {
  createBrandGoogleAdsAccount,
  createBrandGoogleBookingConversion,
} from "@/server/services/google-ads-accounts.service";

const brandSlug = process.argv[2];
if (!brandSlug) throw new Error("Pass a brand slug");
const validateOnly = !process.argv.includes("--apply");

const account = await createBrandGoogleAdsAccount({ brandSlug, validateOnly });
console.log("account", account);
if (!validateOnly || account.account) {
  const conversion = await createBrandGoogleBookingConversion({
    brandSlug,
    validateOnly,
  });
  console.log("conversion", conversion);
}
process.exit(0);
