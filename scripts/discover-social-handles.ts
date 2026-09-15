/**
 * Social-handle discovery (exploratory).
 *
 * Given a brand (name + website), discover its official social profiles across
 * the platforms we model, and emit ranked *suggestions* — not committed data.
 * The eventual product flow is: discover → suggest → human confirms → create
 * `channel` rows on the (peer or owned) brand.
 *
 * Mirrors `social-discovery.service.ts`: fan out to every configured provider
 * (each wrapped so one failure never sinks the rest), then paste the raw
 * evidence into one Claude call — no regex pre-pass.
 *
 *   bun run scripts/discover-social-handles.ts                       # Airbnb
 *   bun run scripts/discover-social-handles.ts "Vrbo" https://vrbo.com
 *
 * Stages:
 *   1. Firecrawl-scrape the site → markdown.
 *   2. Tavily + Parallel + Perplexity → official profile URLs (fills gaps).
 *   3. Claude reads the labelled evidence → one suggestion per platform w/ confidence.
 */

import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

import {
  scrapeUrl,
  isFirecrawlConfigured,
} from "@/server/clients/firecrawl.client";
import {
  tavilySearch,
  parallelSearch,
  perplexitySearch,
  isTavilyConfigured,
  isParallelConfigured,
  isPerplexityConfigured,
  type TavilyResult,
  type ParallelResult,
  type PerplexityResult,
} from "@/server/clients/search-providers.client";
import { isClaudeConfigured } from "@/server/clients/claude.client";

// Platforms we model (subset of channelPlatformEnum that has public profiles).
const PLATFORMS = [
  "linkedin",
  "instagram",
  "x",
  "facebook",
  "youtube",
  "tiktok",
  "threads",
  "reddit",
  "pinterest",
] as const;

// One configured-provider attempt, wrapped so failure is isolated.
async function envelope<T>(
  name: string,
  enabled: boolean,
  fn: () => Promise<T>,
): Promise<{
  name: string;
  ok: boolean;
  value?: T;
  error?: string;
  skipped?: boolean;
}> {
  if (!enabled) return { name, ok: false, skipped: true };
  try {
    return { name, ok: true, value: await fn() };
  } catch (e) {
    return {
      name,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ---- evidence formatting (paste raw text, don't pre-extract) ----------
const clip = (s: string, max: number) =>
  s.length > max ? `${s.slice(0, max)}…[truncated]` : s;

const sourceBlock = (label: string, body: string) =>
  `=== SOURCE: ${label} ===\n${body.trim()}`;

function formatTavily(r: TavilyResult): string {
  const head = r.answer ? `answer: ${r.answer}\n` : "";
  return (
    head +
    r.results
      .map((x) => `- ${x.title} — ${x.url}\n  ${clip(x.content, 500)}`)
      .join("\n")
  );
}

function formatParallel(r: ParallelResult): string {
  return r.results
    .map((x) => `- ${x.title} — ${x.url}\n  ${clip(x.excerpts.join(" "), 500)}`)
    .join("\n");
}

function formatPerplexity(r: PerplexityResult): string {
  const cites = r.citations.length
    ? `\ncitations:\n${r.citations.map((c) => `- ${c}`).join("\n")}`
    : "";
  return clip(r.content, 4_000) + cites;
}

const SUGGESTION_SCHEMA = z.object({
  suggestions: z.array(
    z.object({
      platform: z.enum(PLATFORMS),
      handle: z.string().describe("the account handle/slug, no @ and no URL"),
      profileUrl: z
        .string()
        .describe(
          "canonical public profile URL, exactly as it appears in the evidence",
        ),
      confidence: z.number().min(0).max(1),
      isOfficial: z
        .boolean()
        .describe(
          "the brand's own primary account (not a fan/regional/employee page)",
        ),
      reasoning: z.string().describe("one short sentence"),
      sources: z
        .array(z.string())
        .describe(
          "which labelled sources (website/tavily/parallel/perplexity) the handle appears in",
        ),
    }),
  ),
});

async function main() {
  const name = process.argv[2] ?? "Airbnb";
  const website = process.argv[3] ?? "https://airbnb.com";
  console.log(`\nDiscovering social handles for "${name}" (${website})\n`);

  const blocks: string[] = [];
  const skipped: string[] = [];

  // --- Stage 1: website scrape ---
  const site = await envelope(
    "firecrawl(website)",
    isFirecrawlConfigured,
    async () => {
      const r = await scrapeUrl({ url: website, formats: ["markdown"] });
      return r?.markdown ?? "";
    },
  );
  if (site.skipped) skipped.push("firecrawl");
  if (site.ok && site.value)
    blocks.push(sourceBlock("website", clip(site.value, 8_000)));

  // --- Stage 2: search providers (fan out) ---
  const query = `Official social media profile URLs for "${name}" (${website}): LinkedIn, Instagram, X/Twitter, Facebook, TikTok, YouTube, Threads. Give full profile URLs.`;
  const [tav, par, perp] = await Promise.all([
    envelope("tavily", isTavilyConfigured, () =>
      tavilySearch(`${name} official social media accounts`),
    ),
    envelope("parallel", isParallelConfigured, () =>
      parallelSearch(query, [`${name} official social profiles`]),
    ),
    envelope("perplexity", isPerplexityConfigured, () =>
      perplexitySearch(query),
    ),
  ]);

  if (tav.skipped) skipped.push("tavily");
  else if (!tav.ok || !tav.value) console.log(`  ⚠ tavily: ${tav.error}`);
  else blocks.push(sourceBlock("tavily", formatTavily(tav.value)));

  if (par.skipped) skipped.push("parallel");
  else if (!par.ok || !par.value) console.log(`  ⚠ parallel: ${par.error}`);
  else blocks.push(sourceBlock("parallel", formatParallel(par.value)));

  if (perp.skipped) skipped.push("perplexity");
  else if (!perp.ok || !perp.value)
    console.log(`  ⚠ perplexity: ${perp.error}`);
  else blocks.push(sourceBlock("perplexity", formatPerplexity(perp.value)));

  console.log(`Evidence gathered from ${blocks.length} source(s):`);
  for (const b of blocks) {
    const label = /=== SOURCE: (.+?) ===/.exec(b)?.[1] ?? "?";
    console.log(`  ${label.padEnd(18)} ${b.length} chars`);
  }
  if (skipped.length)
    console.log(`\nskipped (unconfigured): ${skipped.join(", ")}`);
  if (!blocks.length) {
    console.log("\nNo evidence gathered — nothing to consolidate.");
    return;
  }

  // --- Stage 3: Claude reads the evidence ---
  if (!isClaudeConfigured) {
    console.log("\n(Claude not configured — evidence only.)");
    return;
  }
  console.log("\nConsolidating with Claude…");
  const { output } = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    output: Output.object({ schema: SUGGESTION_SCHEMA }),
    prompt:
      `Brand: "${name}" — ${website}\n\n` +
      `Below is search-result and page text from multiple labelled sources. ` +
      `Extract the single best OFFICIAL social profile per platform ` +
      `(${PLATFORMS.join(", ")}).\n` +
      `Rules:\n` +
      `- Only return a handle/URL that ACTUALLY appears in the evidence below — never guess or invent.\n` +
      `- Drop fan pages, regional sub-accounts, employee profiles, and platform chrome (share/intent/etc).\n` +
      `- Omit a platform with no credible candidate.\n` +
      `- confidence = how sure it's the brand's primary official account.\n` +
      `- sources = which labelled sources the handle appears in.\n\n` +
      blocks.join("\n\n"),
  });

  console.log("\n=== SUGGESTIONS (for review → confirm → create channel) ===");
  for (const s of output.suggestions.sort(
    (a, b) => b.confidence - a.confidence,
  )) {
    const flag = s.isOfficial ? "✓" : "?";
    console.log(
      `  ${flag} ${s.platform.padEnd(10)} @${s.handle.padEnd(22)} ${(s.confidence * 100).toFixed(0)}%  ${s.profileUrl}`,
    );
    console.log(`      ${s.reasoning}  [${s.sources.join(", ")}]`);
  }

  const fs = await import("node:fs");
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  fs.writeFileSync(
    `scripts/.social-handles-${slug}.json`,
    JSON.stringify(
      { name, website, evidence: blocks, suggestions: output.suggestions },
      null,
      2,
    ),
  );
  console.log(`\nWritten to scripts/.social-handles-${slug}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
