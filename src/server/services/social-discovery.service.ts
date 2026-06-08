import "server-only";

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  amplifierTable,
  brandTable,
  channelSuggestionTable,
  type AmplifierHandle,
  type ChannelSuggestion,
} from "@/server/db/schema";
import type { channelPlatformEnum } from "@/server/db/channel-schema";
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
import { canVerify, verifyProfile } from "@/server/clients/brightdata.client";
import { enrichBrandFromWebsite } from "@/server/services/brand-enrichment.service";

// Public-profile platforms we discover handles for (subset of channel platforms).
const DISCOVER_PLATFORMS = [
  "linkedin", "instagram", "x", "facebook", "youtube", "tiktok", "threads",
  "reddit", "pinterest",
] as const;
type DiscoverPlatform = (typeof DISCOVER_PLATFORMS)[number];

const PATTERNS: Array<{ platform: DiscoverPlatform; re: RegExp }> = [
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

const STOP = new Set([
  "share", "sharer", "intent", "home", "login", "signup", "watch", "p", "reel",
  "explore", "hashtag", "about", "help", "privacy", "terms", "tr", "embed",
]);

type Candidate = { platform: DiscoverPlatform; handle: string; url: string; source: string };

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

async function envelope<T>(
  enabled: boolean,
  fn: () => Promise<T>,
): Promise<T | null> {
  if (!enabled) return null;
  try {
    return await fn();
  } catch {
    return null;
  }
}

export type SocialSuggestion = {
  platform: DiscoverPlatform;
  handle: string;
  profileUrl: string;
  confidence: number;
  isOfficial: boolean;
  reasoning: string;
  sources: string[];
};

const SCHEMA = z.object({
  suggestions: z.array(
    z.object({
      platform: z.enum(DISCOVER_PLATFORMS),
      handle: z.string(),
      profileUrl: z.string(),
      confidence: z.number().min(0).max(1),
      isOfficial: z.boolean(),
      reasoning: z.string(),
    }),
  ),
});

/**
 * Discover a brand's official social handles: scrape its site + fan out to the
 * search providers, then let Claude consolidate the noisy candidate set into one
 * best official handle per platform. Returns ranked suggestions (not persisted).
 */
export async function discoverSocialHandles(input: {
  name: string;
  website?: string | null;
}): Promise<SocialSuggestion[]> {
  if (!isClaudeConfigured) throw new Error("Claude not configured — discovery needs it.");
  const { name, website } = input;
  const candidates: Candidate[] = [];

  // Stage 1: website scrape.
  if (website) {
    const md = await envelope(isFirecrawlConfigured, async () => {
      const r = await scrapeUrl({ url: website, formats: ["markdown"] });
      return r?.markdown ?? "";
    });
    if (md) candidates.push(...extractCandidates(md, "website"));
  }

  // Stage 2: search providers (fan out, each isolated).
  const query = `Official social media profile URLs for "${name}"${website ? ` (${website})` : ""}: LinkedIn, Instagram, X/Twitter, Facebook, TikTok, YouTube, Threads. Give full profile URLs.`;
  const [tav, par, perp] = await Promise.all([
    envelope(isTavilyConfigured, () => tavilySearch(`${name} official social media accounts`)),
    envelope(isParallelConfigured, () => parallelSearch(query, [`${name} official social profiles`])),
    envelope(isPerplexityConfigured, () => perplexitySearch(query)),
  ]);
  if (tav) candidates.push(...extractCandidates(JSON.stringify(tav), "tavily"));
  if (par) candidates.push(...extractCandidates(JSON.stringify(par), "parallel"));
  if (perp) candidates.push(...extractCandidates(JSON.stringify(perp), "perplexity"));

  // Dedup candidates, tracking which sources surfaced each.
  const bySlug = new Map<string, Candidate & { sources: Set<string> }>();
  for (const c of candidates) {
    const k = `${c.platform}:${c.handle.toLowerCase()}`;
    const ex = bySlug.get(k);
    if (ex) ex.sources.add(c.source);
    else bySlug.set(k, { ...c, sources: new Set([c.source]) });
  }
  const uniq = [...bySlug.values()];
  if (!uniq.length) return [];

  // Stage 3: Claude consolidation.
  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-6"),
    schema: SCHEMA,
    prompt:
      `Brand: "${name}"${website ? ` — ${website}` : ""}\n\n` +
      `Candidate social URLs (platform | handle | url | sources):\n` +
      uniq.map((c) => `${c.platform} | @${c.handle} | ${c.url} | ${[...c.sources].join(",")}`).join("\n") +
      `\n\nReturn the single best OFFICIAL profile per platform. Drop fan pages, ` +
      `regional sub-accounts, employee profiles, and platform chrome (share/intent/etc). ` +
      `Omit a platform with no credible candidate. Confidence = how sure it's the brand's primary official account.`,
  });

  // Normalize the handle (Claude sometimes returns a leading @) and attach the
  // sources we observed for it.
  return object.suggestions.map((s) => {
    const handle = s.handle.replace(/^@+/, "").trim();
    return {
      ...s,
      handle,
      sources: [...(bySlug.get(`${s.platform}:${handle.toLowerCase()}`)?.sources ?? [])],
    };
  });
}

export type DiscoverAndSaveResult = {
  brandId: string;
  discovered: number;
  inserted: number;
  updated: number;
  skippedRejected: number;
  verified: number;
  enrichedBrand: boolean;
  suggestions: ChannelSuggestion[];
};

/**
 * Fill a brand's tagline/description/logo from its website (Firecrawl) when
 * those fields are still empty. Best-effort — never throws. Returns whether it
 * wrote anything.
 */
async function enrichBrandIfSparse(brand: {
  id: string;
  website: string | null;
  tagline: string | null;
  description: string | null;
  logo: string | null;
}): Promise<boolean> {
  if (!brand.website) return false;
  if (brand.tagline && brand.description && brand.logo) return false;
  try {
    const e = await enrichBrandFromWebsite(brand.website);
    if (!e) return false;
    await db
      .update(brandTable)
      .set({
        ...(!brand.tagline && e.tagline ? { tagline: e.tagline } : {}),
        ...(!brand.description && e.description ? { description: e.description } : {}),
        ...(!brand.logo && e.logo ? { logo: e.logo } : {}),
        websiteMeta: e.websiteMeta,
      })
      .where(eq(brandTable.id, brand.id));
    return true;
  } catch {
    return false;
  }
}

/**
 * Discover handles for a brand, optionally verify each via Bright Data, and
 * upsert them into `channel_suggestion` for human review. Never resurrects a
 * `rejected` suggestion.
 */
export async function discoverAndSaveSuggestions(
  brandId: string,
  opts?: { verify?: boolean },
): Promise<DiscoverAndSaveResult> {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
  });
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  // Also fill in brand profile fields from the site while we're here.
  const enrichedBrand = await enrichBrandIfSparse(brand);

  const suggestions = await discoverSocialHandles({ name: brand.name, website: brand.website });

  // Verify (where a profile dataset exists) before persisting.
  const verifications = new Map<string, { verified: boolean; followerCount?: number; error?: string }>();
  if (opts?.verify) {
    await Promise.all(
      suggestions
        .filter((s) => canVerify(s.platform) && s.profileUrl)
        .map(async (s) => {
          try {
            const v = await verifyProfile(s.platform, s.profileUrl);
            if (v) verifications.set(s.platform + s.handle, { verified: v.exists, followerCount: v.followerCount });
          } catch (e) {
            verifications.set(s.platform + s.handle, {
              verified: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }),
    );
  }

  // Existing rows for this brand → decide insert / update / skip-rejected.
  const existing = await db.query.channelSuggestionTable.findMany({
    where: eq(channelSuggestionTable.brandId, brandId),
  });
  const existingByKey = new Map(existing.map((r) => [`${r.platform}:${r.handle.toLowerCase()}`, r]));

  let inserted = 0;
  let updated = 0;
  let skippedRejected = 0;

  for (const s of suggestions) {
    const v = verifications.get(s.platform + s.handle);
    const verifyFields = {
      verified: v ? v.verified : null,
      followerCount: v?.followerCount ?? null,
      verifyError: v?.error ?? null,
      verifiedAt: v ? new Date() : null,
    };

    const prior = existingByKey.get(`${s.platform}:${s.handle.toLowerCase()}`);
    if (prior) {
      if (prior.status === "rejected") {
        skippedRejected++;
        continue;
      }
      await db
        .update(channelSuggestionTable)
        .set({
          profileUrl: s.profileUrl,
          confidence: s.confidence,
          isOfficial: s.isOfficial,
          reasoning: s.reasoning,
          sources: s.sources,
          ...verifyFields,
        })
        .where(eq(channelSuggestionTable.id, prior.id));
      updated++;
    } else {
      await db.insert(channelSuggestionTable).values({
        brandId,
        platform: s.platform as (typeof channelPlatformEnum.enumValues)[number],
        handle: s.handle,
        profileUrl: s.profileUrl,
        confidence: s.confidence,
        isOfficial: s.isOfficial,
        reasoning: s.reasoning,
        sources: s.sources,
        ...verifyFields,
      });
      inserted++;
    }
  }

  const saved = await db.query.channelSuggestionTable.findMany({
    where: and(
      eq(channelSuggestionTable.brandId, brandId),
      eq(channelSuggestionTable.status, "pending"),
    ),
  });

  return {
    brandId,
    discovered: suggestions.length,
    inserted,
    updated,
    skippedRejected,
    verified: [...verifications.values()].filter((x) => x.verified).length,
    enrichedBrand,
    suggestions: saved,
  };
}

// ---- AMPLIFIERS ----------------------------------------------------

export type AmplifierDiscoverResult = {
  amplifierId: string;
  discovered: number;
  handles: AmplifierHandle[];
};

/**
 * Discover an amplifier's social handles — the same discovery flow as brands,
 * pointed at a lightweight contact. Amplifiers have no website (just a name like
 * "QED Investors" or a person), so we search by name only. Confident hits are
 * merged straight into `amplifier.handles` (proto-channels) — no review table,
 * matching the lightweight grain.
 */
export async function discoverAmplifierHandles(
  amplifierId: string,
  opts?: { minConfidence?: number },
): Promise<AmplifierDiscoverResult> {
  const amp = await db.query.amplifierTable.findFirst({
    where: eq(amplifierTable.id, amplifierId),
  });
  if (!amp) throw new Error(`Amplifier ${amplifierId} not found`);

  const suggestions = await discoverSocialHandles({ name: amp.name });
  const min = opts?.minConfidence ?? 0.5;

  // Merge into existing handles (dedup by platform:handle, keep what's there).
  const byKey = new Map<string, AmplifierHandle>(
    (amp.handles ?? []).map((h) => [
      `${h.platform}:${h.handle.toLowerCase()}`,
      h,
    ]),
  );
  for (const s of suggestions) {
    if (s.confidence < min) continue;
    byKey.set(`${s.platform}:${s.handle.toLowerCase()}`, {
      platform: s.platform,
      handle: s.handle,
    });
  }
  const handles = [...byKey.values()];

  await db
    .update(amplifierTable)
    .set({ handles })
    .where(eq(amplifierTable.id, amplifierId));

  return { amplifierId, discovered: suggestions.length, handles };
}
