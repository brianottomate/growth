/**
 * Social-handle discovery (exploratory).
 *
 * Given a brand (name + website), discover its official social profiles across
 * the platforms we model, and emit ranked *suggestions* — not committed data.
 * The eventual product flow is: discover → suggest → human confirms → create
 * `channel` rows on the (peer or owned) brand.
 *
 * Mirrors `lead-discovery.service.ts`: fan out to every configured provider,
 * each wrapped so one failure never sinks the rest; skip unconfigured ones.
 *
 *   bun run scripts/discover-social-handles.ts                       # Airbnb
 *   bun run scripts/discover-social-handles.ts "Vrbo" https://vrbo.com
 *
 * Stages:
 *   1. Firecrawl-scrape the site → regex social links (high precision).
 *   2. Tavily + Parallel + Perplexity → official profile URLs (fills gaps).
 *   3. Claude consolidates candidates → one suggestion per platform w/ confidence.
 */

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

import { scrapeUrl, isFirecrawlConfigured } from "@/server/clients/firecrawl.client";
import {
  tavilySearch,
  parallelSearch,
  perplexitySearch,
  isTavilyConfigured,
  isParallelConfigured,
  isPerplexityConfigured,
} from "@/server/clients/search-providers.client";
import { isClaudeConfigured } from "@/server/clients/claude.client";

// Platforms we model (subset of channelPlatformEnum that has public profiles).
const PLATFORMS = [
  "linkedin", "instagram", "x", "facebook", "youtube", "tiktok", "threads",
  "reddit", "pinterest",
] as const;
type Platform = (typeof PLATFORMS)[number];

// Match a profile URL per platform and capture the handle/slug.
const PATTERNS: Array<{ platform: Platform; re: RegExp }> = [
  { platform: "linkedin", re: /linkedin\.com\/(?:company|in|school)\/([A-Za-z0-9._%-]+)/i },
  { platform: "instagram", re: /instagram\.com\/([A-Za-z0-9._]+)/i },
  { platform: "x", re: /(?:twitter|x)\.com\/([A-Za-z0-9_]+)/i },
  { platform: "facebook", re: /facebook\.com\/([A-Za-z0-9.]+)/i },
  { platform: "youtube", re: /youtube\.com\/(?:@|c\/|channel\/|user\/)?([A-Za-z0-9._-]+)/i },
  { platform: "tiktok", re: /tiktok\.com\/@([A-Za-z0-9._]+)/i },
  { platform: "threads", re: /threads\.(?:net|com)\/@([A-Za-z0-9._]+)/i },
  { platform: "reddit", re: /reddit\.com\/(?:r|user)\/([A-Za-z0-9._-]+)/i },
  { platform: "pinterest", re: /pinterest\.[a-z.]+\/([A-Za-z0-9._-]+)/i },
];

// URL path segments that are platform chrome, never a real handle.
const STOP = new Set([
  "share", "sharer", "intent", "home", "login", "signup", "watch", "p", "reel",
  "explore", "hashtag", "about", "help", "privacy", "terms", "tr", "embed",
]);

type Candidate = { platform: Platform; handle: string; url: string; source: string };

function extractCandidates(text: string, source: string): Candidate[] {
  if (!text) return [];
  const urls = text.match(/https?:\/\/[^\s)"'<>]+/gi) ?? [];
  const out: Candidate[] = [];
  for (const raw of urls) {
    for (const { platform, re } of PATTERNS) {
      const m = re.exec(raw);
      if (m?.[1] && !STOP.has(m[1].toLowerCase())) {
        out.push({ platform, handle: m[1], url: raw.replace(/[).,]+$/, ""), source });
        break;
      }
    }
  }
  return out;
}

// One configured-provider attempt, wrapped so failure is isolated.
async function envelope<T>(
  name: string,
  enabled: boolean,
  fn: () => Promise<T>,
): Promise<{ name: string; ok: boolean; value?: T; error?: string; skipped?: boolean }> {
  if (!enabled) return { name, ok: false, skipped: true };
  try {
    return { name, ok: true, value: await fn() };
  } catch (e) {
    return { name, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const SUGGESTION_SCHEMA = z.object({
  suggestions: z.array(
    z.object({
      platform: z.enum(PLATFORMS),
      handle: z.string().describe("the account handle/slug, no @ and no URL"),
      profileUrl: z.string().describe("canonical public profile URL"),
      confidence: z.number().min(0).max(1),
      isOfficial: z.boolean().describe("the brand's own primary account (not a fan/regional/employee page)"),
      reasoning: z.string().describe("one short sentence"),
    }),
  ),
});

async function main() {
  const name = process.argv[2] ?? "Airbnb";
  const website = process.argv[3] ?? "https://airbnb.com";
  console.log(`\nDiscovering social handles for "${name}" (${website})\n`);

  const candidates: Candidate[] = [];
  const skipped: string[] = [];

  // --- Stage 1: website scrape ---
  const site = await envelope("firecrawl(website)", isFirecrawlConfigured, async () => {
    const r = await scrapeUrl({ url: website, formats: ["markdown"] });
    return r?.markdown ?? "";
  });
  if (site.skipped) skipped.push("firecrawl");
  if (site.ok && site.value) candidates.push(...extractCandidates(site.value, "website"));

  // --- Stage 2: search providers (fan out) ---
  const query = `Official social media profile URLs for "${name}" (${website}): LinkedIn, Instagram, X/Twitter, Facebook, TikTok, YouTube, Threads. Give full profile URLs.`;
  const providers = await Promise.all([
    envelope("tavily", isTavilyConfigured, () => tavilySearch(`${name} official social media accounts`)),
    envelope("parallel", isParallelConfigured, () => parallelSearch(query, [`${name} official social profiles`])),
    envelope("perplexity", isPerplexityConfigured, () => perplexitySearch(query)),
  ]);

  for (const p of providers) {
    if (p.skipped) { skipped.push(p.name); continue; }
    if (!p.ok || !p.value) { console.log(`  ⚠ ${p.name}: ${p.error}`); continue; }
    const v = p.value as Record<string, unknown>;
    // Pull URLs from result rows + any answer/content text.
    const blob = JSON.stringify(v);
    candidates.push(...extractCandidates(blob, p.name));
  }

  // Dedup raw candidates for display.
  const seen = new Set<string>();
  const uniq = candidates.filter((c) => {
    const k = `${c.platform}:${c.handle.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  console.log(`Raw candidates (${uniq.length}) from ${[...new Set(uniq.map((c) => c.source))].join(", ") || "none"}:`);
  for (const c of uniq) console.log(`  ${c.platform.padEnd(10)} @${c.handle.padEnd(24)} ${c.url}  [${c.source}]`);
  if (skipped.length) console.log(`\nskipped (unconfigured): ${skipped.join(", ")}`);

  // --- Stage 3: Claude consolidation ---
  if (!isClaudeConfigured) {
    console.log("\n(Claude not configured — raw candidates only.)");
    return;
  }
  console.log("\nConsolidating with Claude…");
  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-6"),
    schema: SUGGESTION_SCHEMA,
    prompt:
      `Brand: "${name}" — ${website}\n\n` +
      `Candidate social URLs found (platform | handle | url | source):\n` +
      uniq.map((c) => `${c.platform} | @${c.handle} | ${c.url} | ${c.source}`).join("\n") +
      `\n\nReturn the single best OFFICIAL profile per platform. Drop fan pages, ` +
      `regional sub-accounts, employee profiles, and platform chrome (share/intent/etc). ` +
      `If a platform has no credible candidate, omit it. Confidence reflects how sure ` +
      `you are it's the brand's primary official account.`,
  });

  console.log("\n=== SUGGESTIONS (for review → confirm → create channel) ===");
  for (const s of object.suggestions.sort((a, b) => b.confidence - a.confidence)) {
    const flag = s.isOfficial ? "✓" : "?";
    console.log(`  ${flag} ${s.platform.padEnd(10)} @${s.handle.padEnd(22)} ${(s.confidence * 100).toFixed(0)}%  ${s.profileUrl}`);
    console.log(`      ${s.reasoning}`);
  }

  const fs = await import("node:fs");
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  fs.writeFileSync(`scripts/.social-handles-${slug}.json`, JSON.stringify({ name, website, candidates: uniq, suggestions: object.suggestions }, null, 2));
  console.log(`\nWritten to scripts/.social-handles-${slug}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
