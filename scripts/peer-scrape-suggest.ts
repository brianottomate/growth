/**
 * Peer/own scrape → platform_post → pending AI suggestions.
 *
 * Run with `--conditions react-server` (server-only modules), like sync-content.
 *
 *   bun --conditions react-server scripts/peer-scrape-suggest.ts fixture <brandSlug> [--no-template]
 *     → process scripts/.brightdata-last.json as LinkedIn records (no scrape/cost)
 *
 *   bun --conditions react-server scripts/peer-scrape-suggest.ts live <brandSlug> <linkedin|x> [--limit=N] [--no-template]
 *     → scrape the brand's channel profile URL, then process
 *
 * Everything lands as PENDING content_suggestion rows — inspect, then confirm.
 */
import { readFileSync } from "node:fs";

import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import {
  ingestXViaApi,
  processRecords,
  profileUrlForBrand,
  scrapeAndSuggest,
  xHandleForBrand,
} from "@/server/services/peer-scrape.service";

const [mode, slug, platformArg] = process.argv.slice(2);
const skipTemplate = process.argv.includes("--no-template");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;
const fileArg = process.argv.find((a) => a.startsWith("--file="));
const fixtureFile = fileArg?.split("=")[1] ?? "scripts/.brightdata-last.json";
const useApi = process.argv.includes("--api"); // X amplification via X API
const pagesArg = process.argv.find((a) => a.startsWith("--pages="));
const pages = pagesArg ? Number(pagesArg.split("=")[1]) : undefined;

if (!mode || !slug) {
  console.error(
    "usage: peer-scrape-suggest.ts fixture <slug> | live <slug> <linkedin|x> [--limit=N] [--no-template]",
  );
  process.exit(1);
}

const [brand] = await db
  .select({ id: brandTable.id, name: brandTable.name })
  .from(brandTable)
  .where(eq(brandTable.slug, slug))
  .limit(1);
if (!brand) {
  console.error(`no brand with slug "${slug}"`);
  process.exit(1);
}

console.log(`Brand: ${brand.name} (${brand.id}) — template=${!skipTemplate}`);

let result;
if (mode === "fixture") {
  const raw = JSON.parse(readFileSync(fixtureFile, "utf8")) as Record<
    string,
    unknown
  >[];
  console.log(`Fixture (${fixtureFile}): ${raw.length} LinkedIn records`);
  result = await processRecords({
    brandId: brand.id,
    platform: "linkedin",
    records: raw,
    skipTemplate,
  });
} else if (mode === "live") {
  const platform = platformArg as "linkedin" | "x";
  if (platform !== "linkedin" && platform !== "x") {
    console.error("platform must be linkedin or x");
    process.exit(1);
  }
  if (platform === "x" && useApi) {
    // X amplification source: official API (referenced_tweets), not Bright Data.
    const handle = await xHandleForBrand(brand.id);
    if (!handle) {
      console.error(`no X channel handle for ${brand.name}`);
      process.exit(1);
    }
    console.log(`X API: @${handle.replace(/^@/, "")} (pages=${pages ?? 3})`);
    result = await ingestXViaApi({
      brandId: brand.id,
      handle,
      maxPages: pages,
      skipTemplate,
    });
  } else {
    const url = await profileUrlForBrand(brand.id, platform);
    if (!url) {
      console.error(`no ${platform} channel profileUrl for ${brand.name}`);
      process.exit(1);
    }
    console.log(`Scraping ${platform}: ${url}`);
    result = await scrapeAndSuggest({
      brandId: brand.id,
      platform,
      profileUrl: url,
      limit,
      skipTemplate,
    });
  }
} else {
  console.error(`unknown mode "${mode}"`);
  process.exit(1);
}

console.log("\nResult:", result);
process.exit(0);
