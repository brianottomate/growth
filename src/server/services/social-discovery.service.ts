import "server-only";

import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  amplifierTable,
  brandTable,
  channelTable,
  channelSuggestionTable,
  type AmplifierHandle,
  type ChannelSuggestion,
} from "@/server/db/schema";
import type { channelPlatformEnum } from "@/server/db/channel-schema";
import {
  firecrawl,
  scrapeUrl,
  isFirecrawlConfigured,
} from "@/server/clients/firecrawl.client";
import {
  tavilySearch,
  isTavilyConfigured,
  type TavilyResult,
} from "@/server/clients/search-providers.client";
import { isClaudeConfigured } from "@/server/clients/claude.client";
import { canVerify, verifyProfile } from "@/server/clients/brightdata.client";
import { enrichBrandFromWebsite } from "@/server/services/brand-enrichment.service";

// Public-profile platforms we discover handles for (subset of channel platforms).
const DISCOVER_PLATFORMS = [
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
type DiscoverPlatform = (typeof DISCOVER_PLATFORMS)[number];

// Cap a source's text so a single fat result can't blow the context budget.
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

function formatFirecrawlSearch(
  results: Array<{ url: string; title?: string; description?: string }>,
): string {
  return results
    .map(
      (result) =>
        `- ${result.title ?? "Untitled"} — ${result.url}\n  ${clip(result.description ?? "", 500)}`,
    )
    .join("\n");
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
      handle: z.string().describe("Handle only, no leading @ and no URL"),
      profileUrl: z
        .string()
        .describe("Full profile URL exactly as it appears in the evidence"),
      confidence: z.number().min(0).max(1),
      isOfficial: z.boolean(),
      reasoning: z.string(),
      sources: z
        .array(z.string())
        .describe(
          "Which labelled sources (website/firecrawl-search/tavily) this handle appears in",
        ),
    }),
  ),
});

/**
 * Discover a brand's official social handles: scrape its site + fan out to the
 * search providers (deterministically — we know which to hit), then paste that
 * raw evidence into one Claude call that extracts the best official handle per
 * platform. No regex pre-pass — the model reads the same text a human would, so
 * it catches plain-text @mentions, not just clean profile URLs. Grounding comes
 * from instructing it to only return handles present in the evidence. Returns
 * ranked suggestions (not persisted).
 */
export async function discoverSocialHandles(input: {
  name: string;
  website?: string | null;
  type?: "company" | "personal";
}): Promise<SocialSuggestion[]> {
  if (!isClaudeConfigured)
    throw new Error("Claude not configured — discovery needs it.");
  const { name, website, type } = input;
  const blocks: string[] = [];

  // Stage 1: website scrape.
  if (website) {
    const md = await envelope(isFirecrawlConfigured, async () => {
      const r = await scrapeUrl({ url: website, formats: ["markdown"] });
      return r?.markdown ?? "";
    });
    if (md) blocks.push(sourceBlock("website", clip(md, 8_000)));
  }

  // Stage 2: search (fan out, each isolated). Firecrawl's per-platform `site:`
  // searches are the workhorse — on the 2026-09-08 Winter Park Escapes probe
  // they alone surfaced every handle. Tavily stays as the one second opinion
  // for confidence scoring. Parallel, Perplexity and Exa were dropped from this
  // fan-out: they only ever echoed what Firecrawl had already found and added
  // latency and spend (see scripts/probe-brand-baseline.ts).
  const domain = website
    ? (() => {
        try {
          return new URL(website).hostname.replace(/^www\./, "");
        } catch {
          return website;
        }
      })()
    : "";
  const [firecrawlResults, tav] = await Promise.all([
    envelope(isFirecrawlConfigured, async () => {
      const siteQueries = [
        "instagram.com",
        "x.com",
        "linkedin.com/company",
        "linkedin.com/in",
        "facebook.com",
        "tiktok.com/@",
        "youtube.com",
        "threads.net",
        "pinterest.com",
      ].map((site) => `site:${site} ${name}${domain ? ` ${domain}` : ""}`);
      const results = await Promise.all(
        siteQueries.map((searchQuery) =>
          firecrawl.search(searchQuery, { limit: 5, sources: ["web"] }),
        ),
      );
      return results.flatMap((result) =>
        (result.web ?? []).flatMap((candidate) => {
          const web = candidate as {
            url?: unknown;
            title?: unknown;
            description?: unknown;
          };
          if (typeof web.url !== "string") return [];
          return [
            {
              url: web.url,
              title: typeof web.title === "string" ? web.title : undefined,
              description:
                typeof web.description === "string"
                  ? web.description
                  : undefined,
            },
          ];
        }),
      );
    }),
    envelope(isTavilyConfigured, () =>
      tavilySearch(`${name} official social media accounts`),
    ),
  ]);
  if (firecrawlResults?.length) {
    blocks.push(
      sourceBlock("firecrawl-search", formatFirecrawlSearch(firecrawlResults)),
    );
  }
  if (tav) blocks.push(sourceBlock("tavily", formatTavily(tav)));

  if (!blocks.length) {
    throw new Error(
      "Discovery found no readable website or search evidence. Check the Firecrawl key or add another search provider.",
    );
  }

  // Stage 3: Claude reads the evidence and returns one official handle per platform.
  const { output } = await generateText({
    model: anthropic("claude-sonnet-5"),
    output: Output.object({ schema: SCHEMA }),
    prompt:
      `Brand: "${name}"${website ? ` — ${website}` : ""}\n\n` +
      `Below is search-result and page text from multiple labelled sources. ` +
      `Extract the single best OFFICIAL social profile per platform ` +
      `(${DISCOVER_PLATFORMS.join(", ")}).\n` +
      `Rules:\n` +
      `- Only return a handle/URL that ACTUALLY appears in the evidence below — never guess or invent.\n` +
      `- Drop fan pages, regional sub-accounts, unrelated employee profiles, and platform chrome (share/intent/etc).\n` +
      (type === "personal"
        ? `- This IS a personal brand: keep the person's own LinkedIn /in/ profile and creator accounts when supported by the evidence.\n`
        : "") +
      `- Omit a platform with no credible candidate.\n` +
      `- confidence = how sure it's the brand's primary official account.\n` +
      `- sources = which labelled sources the handle appears in.\n\n` +
      blocks.join("\n\n"),
  });

  // Normalize the handle (the model sometimes returns a leading @).
  return output.suggestions.map((s) => ({
    ...s,
    handle: s.handle.replace(/^@+/, "").trim(),
    sources: s.sources ?? [],
  }));
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
        ...(!brand.description && e.description
          ? { description: e.description }
          : {}),
        ...(!brand.logo && e.logo ? { logo: e.logo } : {}),
        websiteMeta: e.websiteMeta,
      })
      .where(eq(brandTable.id, brand.id));
    return true;
  } catch {
    return false;
  }
}

/** Below this the model is guessing; a reviewer gains nothing from seeing it. */
const MIN_PERSIST_CONFIDENCE = 0.3;

/** A single post/video/status is never a profile, whatever the model says. */
const NON_PROFILE_PATH =
  /\/(status|p|reel|reels|posts|watch|shorts|video|videos)\//i;

/**
 * Cheap floor applied before persisting: drops low-confidence guesses and
 * "profiles" that are really a post URL. Motivated by a 2026-09-08 re-run that
 * saved `x.com/<handle>/status/<id>` at 15% as a pending suggestion.
 */
function isPersistableSuggestion(s: SocialSuggestion): boolean {
  if (s.confidence < MIN_PERSIST_CONFIDENCE) return false;
  try {
    if (NON_PROFILE_PATH.test(new URL(s.profileUrl).pathname)) return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * Discover handles for a brand and upsert them into `channel_suggestion` for
 * human review. Never resurrects a `rejected` suggestion.
 *
 * Verification is opt-in (`verify: true`) and off by default: Bright Data only
 * covers Instagram and LinkedIn, and its polling was the bulk of an 84s run on
 * the 2026-09-08 probe. The reviewer (or an agent) confirms a suggestion by
 * opening the link, and the first sample scrape after acceptance proves the
 * profile exists and fills follower counts as a side effect.
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

  const discoveredSuggestions = await discoverSocialHandles({
    name: brand.name,
    website: brand.website,
    type: brand.type,
  });
  const existingChannels = await db.query.channelTable.findMany({
    where: eq(channelTable.brandId, brandId),
    columns: { platform: true, handle: true, profileUrl: true },
  });
  const suggestions = discoveredSuggestions.filter(
    (suggestion) =>
      isPersistableSuggestion(suggestion) &&
      !existingChannels.some(
        (channel) =>
          channel.platform === suggestion.platform &&
          (channel.handle?.replace(/^@/, "").toLowerCase() ===
            suggestion.handle.toLowerCase() ||
            channel.profileUrl === suggestion.profileUrl),
      ),
  );

  // Verify (where a profile dataset exists) before persisting.
  const verifications = new Map<
    string,
    {
      verified: boolean | null;
      followerCount?: number;
      profileImageUrl?: string;
      error?: string;
    }
  >();
  if (opts?.verify) {
    await Promise.all(
      suggestions
        .filter((s) => canVerify(s.platform) && s.profileUrl)
        .map(async (s) => {
          try {
            const v = await verifyProfile(s.platform, s.profileUrl);
            if (v)
              verifications.set(s.platform + s.handle, {
                verified: v.exists,
                followerCount: v.followerCount,
                profileImageUrl: v.profileImageUrl,
              });
          } catch (e) {
            verifications.set(s.platform + s.handle, {
              verified: null,
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
  const existingByKey = new Map(
    existing.map((r) => [`${r.platform}:${r.handle.toLowerCase()}`, r]),
  );

  let inserted = 0;
  let updated = 0;
  let skippedRejected = 0;

  for (const s of suggestions) {
    const v = verifications.get(s.platform + s.handle);
    const verifyFields = {
      verified: v ? v.verified : null,
      followerCount: v?.followerCount ?? null,
      profileImageUrl: v?.profileImageUrl ?? null,
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

  const suggestions = await discoverSocialHandles({
    name: amp.name,
    type: amp.type === "creator" ? "personal" : undefined,
  });
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
