/**
 * LOCAL PROBE — compose the existing discovery stack into one "brand baseline"
 * run for a single brand, and measure it: wall time, provider usage, what came
 * back, what failed. The point is to learn the real shape of the workflow on a
 * live brand BEFORE building it into a oRPC mutation and an agent tool.
 *
 * Stages (each timed, each wrapped so one failure does not sink the rest):
 *   1. state     — read brand, channels, suggestions, post counts
 *   2. enrich    — enrichBrandById (Firecrawl branding scrape); skipped when
 *                  the brand already has an identity unless --enrich
 *   3. discover  — discoverAndSaveSuggestions (Firecrawl + Tavily → Claude);
 *                  unverified unless --verify (Bright Data, IG + LinkedIn only,
 *                  and the slow part of the run); skipped when suggestions
 *                  already exist unless --force-discover
 *   4. accept    — promote pending suggestions with confidence >= N that were
 *                  not proven dead by verification into `channel` rows
 *                  (mirrors channelSuggestion.accept; reviewedById is null)
 *   5. scrape    — for every social channel on a scrapable platform, pull the
 *                  last --since days of posts (X via the official API when a
 *                  bearer token exists, Bright Data/Apify otherwise); a platform
 *                  scraped within the last 24h is skipped
 *   6. synth     — Claude reads the enrichment + posts and drafts the baseline:
 *                  voice, themes, audience signals, competitors, and PROPOSED
 *                  pillars and personas with evidence. Cadence and top posts are
 *                  computed deterministically, not by the model. Nothing from
 *                  this stage is written to the database.
 *
 * WRITES: enrich/discover/accept/scrape write to the connected database exactly
 * as the corresponding UI buttons do. Run against a Neon branch if you want a
 * sandbox. The report goes to scripts/.probe-baseline-<slug>-<timestamp>.json.
 *
 * Run:
 *   bun --conditions react-server scripts/probe-brand-baseline.ts <slug>
 *     [--enrich] [--force-discover | --no-discover] [--verify] [--accept=0.8]
 *     [--scrape] [--since=90] [--limit=30] [--synth]
 *
 * Typical two-step session:
 *   ... <slug>                       # state + discover, then read the report
 *   ... <slug> --accept=0.8 --scrape --synth
 */
import { writeFileSync } from "node:fs";

import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import {
  brandTable,
  channelSuggestionTable,
  channelTable,
  platformPostTable,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import type { PostStats } from "@/server/db/content-schema";
import { env } from "@/env";
import { enrichBrandById } from "@/server/services/brand-ops.service";
import {
  ingestXViaApi,
  scrapeBrandChannel,
  type ScrapePlatform,
} from "@/server/services/peer-scrape.service";
import { discoverAndSaveSuggestions } from "@/server/services/social-discovery.service";

// ---- args -----------------------------------------------------------------

const argv = process.argv.slice(2);
const slug = argv.find((a) => !a.startsWith("--"));
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

if (!slug) {
  console.error(
    "usage: probe-brand-baseline.ts <brandSlug> [--enrich] [--force-discover|--no-discover] [--accept=0.8] [--scrape] [--since=90] [--limit=30] [--synth]",
  );
  process.exit(1);
}

const FORCE_ENRICH = flag("enrich");
const FORCE_DISCOVER = flag("force-discover");
const VERIFY = flag("verify");
const NO_DISCOVER = flag("no-discover");
const ACCEPT_MIN = opt("accept") ? Number(opt("accept")) : null;
const SCRAPE = flag("scrape");
const SINCE_DAYS = Number(opt("since") ?? 90);
const LIMIT = Number(opt("limit") ?? 30);
const SYNTH = flag("synth");

const SCRAPABLE: ScrapePlatform[] = ["linkedin", "x", "instagram", "facebook"];
const FRESH_MS = 24 * 3_600_000;

// ---- report plumbing --------------------------------------------------------

type StageName =
  | "state"
  | "enrich"
  | "discover"
  | "accept"
  | "scrape"
  | "synth";
type Stage = {
  stage: StageName;
  status: "ok" | "skipped" | "error";
  ms: number;
  note?: string;
  result?: unknown;
  error?: string;
};

const startedAt = new Date();
const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
const OUT = `scripts/.probe-baseline-${slug}-${stamp}.json`;
const report: { slug: string; startedAt: string; stages: Stage[] } = {
  slug,
  startedAt: startedAt.toISOString(),
  stages: [],
};

function save() {
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}

async function stage<T>(
  name: StageName,
  run: () => Promise<{ skip?: string; result?: T; note?: string }>,
): Promise<T | undefined> {
  const t0 = performance.now();
  process.stdout.write(`\n▶ ${name} `);
  try {
    const r = await run();
    const ms = Math.round(performance.now() - t0);
    if (r.skip) {
      report.stages.push({ stage: name, status: "skipped", ms, note: r.skip });
      console.log(`— skipped (${r.skip})`);
      save();
      return undefined;
    }
    report.stages.push({
      stage: name,
      status: "ok",
      ms,
      note: r.note,
      result: r.result,
    });
    console.log(
      `— ok in ${(ms / 1000).toFixed(1)}s${r.note ? ` (${r.note})` : ""}`,
    );
    save();
    return r.result;
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    const message =
      err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
    report.stages.push({ stage: name, status: "error", ms, error: message });
    console.log(
      `— ERROR in ${(ms / 1000).toFixed(1)}s\n   ${message.split("\n")[0]}`,
    );
    save();
    return undefined;
  }
}

// ---- 1. state ----------------------------------------------------------------

const brand = await db.query.brandTable.findFirst({
  where: eq(brandTable.slug, slug),
});
if (!brand) {
  console.error(`no brand with slug "${slug}"`);
  process.exit(1);
}
console.log(
  `Brand: ${brand.name} (${brand.id}) ${brand.website ?? "— no website"}`,
);
console.log(`Report: ${OUT}`);

async function readState() {
  const channels = await db
    .select({
      id: channelTable.id,
      kind: channelTable.kind,
      platform: channelTable.platform,
      handle: channelTable.handle,
      profileUrl: channelTable.profileUrl,
      followerCount: channelTable.followerCount,
      connectionStatus: channelTable.connectionStatus,
    })
    .from(channelTable)
    .where(
      and(
        eq(channelTable.brandId, brand!.id),
        eq(channelTable.isActive, true),
        isNull(channelTable.deletedAt),
      ),
    );
  const suggestions = await db
    .select({
      id: channelSuggestionTable.id,
      platform: channelSuggestionTable.platform,
      handle: channelSuggestionTable.handle,
      profileUrl: channelSuggestionTable.profileUrl,
      confidence: channelSuggestionTable.confidence,
      verified: channelSuggestionTable.verified,
      followerCount: channelSuggestionTable.followerCount,
      verifyError: channelSuggestionTable.verifyError,
      status: channelSuggestionTable.status,
      sources: channelSuggestionTable.sources,
      reasoning: channelSuggestionTable.reasoning,
    })
    .from(channelSuggestionTable)
    .where(eq(channelSuggestionTable.brandId, brand!.id));
  const posts = await db
    .select({
      platform: platformPostTable.platform,
      n: sql<number>`count(*)::int`,
      latestPublished: sql<
        string | null
      >`max(${platformPostTable.publishedAt})`,
      latestScraped: sql<string | null>`max(${platformPostTable.scrapedAt})`,
    })
    .from(platformPostTable)
    .where(eq(platformPostTable.brandId, brand!.id))
    .groupBy(platformPostTable.platform);
  return { channels, suggestions, posts };
}

let state = (await stage("state", async () => {
  const s = await readState();
  return {
    result: {
      brand: {
        tagline: brand.tagline,
        description: brand.description,
        hasLogo: !!brand.logo,
        hasIdentity: !!brand.brandIdentity,
        websiteScrapedAt: brand.websiteMeta?.scrapedAt ?? null,
      },
      ...s,
    },
    note: `${s.channels.length} channels, ${s.suggestions.length} suggestions, ${s.posts.reduce((a, p) => a + p.n, 0)} posts`,
  };
}))!;

// ---- 2. enrich -------------------------------------------------------------

await stage("enrich", async () => {
  if (!brand.website) return { skip: "no website" };
  if (
    !FORCE_ENRICH &&
    brand.brandIdentity &&
    brand.tagline &&
    brand.description
  ) {
    return {
      skip: `already enriched ${brand.websiteMeta?.scrapedAt ?? ""}; pass --enrich to refresh`,
    };
  }
  const r = await enrichBrandById(brand.id);
  if (!r) return { result: null, note: "site could not be read" };
  return {
    result: {
      tagline: r.enrichment.tagline,
      description: r.enrichment.description,
      logo: r.enrichment.logo,
      personality: r.enrichment.brandIdentity?.personality,
      colors: r.enrichment.brandIdentity?.colors,
      fonts: r.enrichment.brandIdentity?.fonts,
    },
  };
});

// ---- 3. discover -----------------------------------------------------------

await stage("discover", async () => {
  if (NO_DISCOVER) return { skip: "--no-discover" };
  if (!FORCE_DISCOVER && state.suggestions.length) {
    return {
      skip: `${state.suggestions.length} suggestions already exist; pass --force-discover to re-run`,
    };
  }
  const r = await discoverAndSaveSuggestions(brand.id, { verify: VERIFY });
  const rows = r.suggestions
    .slice()
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .map((s) => ({
      platform: s.platform,
      handle: s.handle,
      profileUrl: s.profileUrl,
      confidence: s.confidence,
      verified: s.verified,
      followerCount: s.followerCount,
      verifyError: s.verifyError,
      sources: s.sources,
      reasoning: s.reasoning,
    }));
  console.log();
  for (const s of rows) {
    const ver =
      s.verified == null
        ? "unverified"
        : s.verified
          ? `✓ ${s.followerCount?.toLocaleString() ?? "?"} followers`
          : `✗ ${s.verifyError ?? "unresolved"}`;
    console.log(
      `   ${s.platform.padEnd(10)} @${s.handle.padEnd(24)} ${((s.confidence ?? 0) * 100).toFixed(0).padStart(3)}%  ${ver}`,
    );
    console.log(
      `   ${"".padEnd(10)} ${s.profileUrl}  [${(s.sources ?? []).join(", ")}]`,
    );
  }
  return {
    result: {
      counts: {
        discovered: r.discovered,
        inserted: r.inserted,
        updated: r.updated,
        skippedRejected: r.skippedRejected,
        verified: r.verified,
        enrichedBrand: r.enrichedBrand,
      },
      suggestions: rows,
    },
    note: `${r.discovered} found, ${r.verified} verified`,
  };
});

state = (await readState()) as typeof state;

// ---- 4. accept ---------------------------------------------------------------

await stage("accept", async () => {
  if (ACCEPT_MIN == null)
    return { skip: "pass --accept=<minConfidence> to promote suggestions" };
  const pending = state.suggestions.filter(
    (s) =>
      s.status === "pending" &&
      (s.confidence ?? 0) >= ACCEPT_MIN &&
      s.verified !== false,
  );
  if (!pending.length)
    return {
      skip: `no pending suggestions at >= ${ACCEPT_MIN} that survived verification`,
    };
  const now = new Date();
  const accepted: Array<{
    platform: string;
    handle: string;
    channelId: string;
    created: boolean;
  }> = [];
  for (const s of pending) {
    let channel = await db.query.channelTable.findFirst({
      where: and(
        eq(channelTable.brandId, brand.id),
        eq(channelTable.platform, s.platform),
        sql`lower(${channelTable.handle}) = lower(${s.handle.replace(/^@/, "")})`,
      ),
    });
    let created = false;
    if (!channel) {
      [channel] = await db
        .insert(channelTable)
        .values({
          id: createId("chan"),
          brandId: brand.id,
          kind: "social",
          platform: s.platform,
          handle: s.handle,
          profileUrl: s.profileUrl,
          connectionStatus: "disconnected",
          followerCount: s.followerCount ?? null,
          followerHistory: s.followerCount
            ? [{ count: s.followerCount, capturedAt: now.toISOString() }]
            : [],
        })
        .returning();
      created = true;
    }
    await db
      .update(channelSuggestionTable)
      .set({
        status: "accepted",
        acceptedChannelId: channel!.id,
        reviewedAt: now,
      })
      .where(eq(channelSuggestionTable.id, s.id));
    accepted.push({
      platform: s.platform,
      handle: s.handle,
      channelId: channel!.id,
      created,
    });
    console.log(
      `\n   accepted ${s.platform} @${s.handle}${created ? " (new channel)" : " (existing channel)"}`,
    );
  }
  return { result: accepted, note: `${accepted.length} accepted` };
});

state = (await readState()) as typeof state;

// ---- 5. scrape ---------------------------------------------------------------

await stage("scrape", async () => {
  if (!SCRAPE)
    return {
      skip: "pass --scrape to pull posts (Bright Data / Apify cost per record; X API is free)",
    };
  const social = state.channels.filter(
    (c) => c.kind === "social" && (SCRAPABLE as string[]).includes(c.platform),
  );
  if (!social.length)
    return {
      skip: "no social channels on a scrapable platform (linkedin, x, instagram, facebook)",
    };

  const perPlatform: Record<string, unknown> = {};
  for (const c of social) {
    const platform = c.platform as ScrapePlatform;
    const recent = state.posts.find((p) => p.platform === platform);
    if (
      recent?.latestScraped &&
      Date.now() - new Date(recent.latestScraped).getTime() < FRESH_MS
    ) {
      perPlatform[platform] = { skipped: `scraped ${recent.latestScraped}` };
      console.log(`\n   ${platform}: skipped, scraped within 24h`);
      continue;
    }
    const t0 = performance.now();
    try {
      let result: unknown;
      let provider: string;
      if (platform === "x" && env.X_BEARER_TOKEN && c.handle) {
        provider = "x_api";
        result = await ingestXViaApi({
          brandId: brand.id,
          handle: c.handle,
          maxPages: 3,
        });
      } else {
        const r = await scrapeBrandChannel({
          brandId: brand.id,
          platform,
          limit: LIMIT,
          sinceDays: SINCE_DAYS,
        });
        provider = r.provider;
        result = r;
      }
      const ms = Math.round(performance.now() - t0);
      perPlatform[platform] = { provider, ms, ...(result as object) };
      console.log(
        `\n   ${platform} via ${provider} in ${(ms / 1000).toFixed(1)}s: ${JSON.stringify(result)}`,
      );
    } catch (err) {
      const ms = Math.round(performance.now() - t0);
      const message = err instanceof Error ? err.message : String(err);
      perPlatform[platform] = { error: message, ms };
      console.log(
        `\n   ${platform}: ERROR after ${(ms / 1000).toFixed(1)}s — ${message}`,
      );
    }
  }
  return { result: perPlatform };
});

state = (await readState()) as typeof state;

// ---- 6. synth ----------------------------------------------------------------

const BASELINE = z.object({
  voice: z.object({
    tone: z.string(),
    energy: z.string(),
    pointOfView: z
      .string()
      .describe("first-person plural, host voice, concierge, etc."),
    recurringPhrases: z.array(z.string()).max(8),
  }),
  themes: z
    .array(
      z.object({
        theme: z.string(),
        share: z.number().min(0).max(1),
        evidence: z.array(z.string()).max(3).describe("post URLs or ids"),
      }),
    )
    .max(8),
  audienceSignals: z
    .array(
      z.object({ signal: z.string(), evidence: z.array(z.string()).max(3) }),
    )
    .max(8),
  competitors: z.array(z.object({ name: z.string(), why: z.string() })).max(6),
  gaps: z
    .array(z.string())
    .max(6)
    .describe(
      "what the evidence does NOT tell us; what a human should confirm",
    ),
  proposedPillars: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        evidence: z.array(z.string()).max(3),
      }),
    )
    .min(3)
    .max(5),
  proposedPersonas: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        ageRanges: z.array(z.string()).max(3),
        geographies: z.array(z.string()).max(4),
        evidence: z.array(z.string()).max(3),
      }),
    )
    .min(2)
    .max(3),
});

await stage("synth", async () => {
  if (!SYNTH)
    return {
      skip: "pass --synth to draft the baseline with Claude (no DB writes)",
    };
  if (!env.ANTHROPIC_API_KEY) return { skip: "ANTHROPIC_API_KEY missing" };

  const since = new Date(Date.now() - SINCE_DAYS * 86_400_000);
  const posts = await db
    .select({
      id: platformPostTable.id,
      platform: platformPostTable.platform,
      text: platformPostTable.text,
      stats: platformPostTable.stats,
      externalUrl: platformPostTable.externalUrl,
      publishedAt: platformPostTable.publishedAt,
      media: platformPostTable.media,
    })
    .from(platformPostTable)
    .where(
      and(
        eq(platformPostTable.brandId, brand.id),
        gte(platformPostTable.publishedAt, since),
      ),
    )
    .orderBy(desc(platformPostTable.publishedAt))
    .limit(300);

  // Deterministic parts: cadence and top posts. The model should not do arithmetic.
  const weeks = Math.max(1, SINCE_DAYS / 7);
  const cadence: Record<
    string,
    {
      posts: number;
      perWeek: number;
      lastPost: string | null;
      daysSinceLast: number | null;
    }
  > = {};
  for (const p of posts) {
    const c = (cadence[p.platform] ??= {
      posts: 0,
      perWeek: 0,
      lastPost: null,
      daysSinceLast: null,
    });
    c.posts += 1;
    const iso = p.publishedAt?.toISOString() ?? null;
    if (iso && (!c.lastPost || iso > c.lastPost)) c.lastPost = iso;
  }
  for (const c of Object.values(cadence)) {
    c.perWeek = Number((c.posts / weeks).toFixed(2));
    c.daysSinceLast = c.lastPost
      ? Math.round((Date.now() - new Date(c.lastPost).getTime()) / 86_400_000)
      : null;
  }
  const score = (s: PostStats | null) =>
    (s?.likes ?? 0) +
    2 * (s?.comments ?? 0) +
    3 * (s?.shares ?? 0) +
    (s?.saves ?? 0);
  const topPosts = posts
    .slice()
    .sort((a, b) => score(b.stats) - score(a.stats))
    .slice(0, 8)
    .map((p) => ({
      platform: p.platform,
      url: p.externalUrl,
      score: score(p.stats),
      stats: p.stats,
      text: p.text?.slice(0, 200),
      publishedAt: p.publishedAt,
    }));

  const identity = brand.brandIdentity;
  const evidence =
    `BRAND\nname: ${brand.name}\nwebsite: ${brand.website}\ntagline: ${brand.tagline}\ndescription: ${brand.description}\n` +
    `website personality (Firecrawl): ${JSON.stringify(identity?.personality ?? null)}\n\n` +
    `CHANNELS\n${state.channels.map((c) => `- ${c.platform} @${c.handle} followers=${c.followerCount ?? "?"}`).join("\n") || "(none)"}\n\n` +
    `CADENCE (computed over last ${SINCE_DAYS} days)\n${JSON.stringify(cadence)}\n\n` +
    `POSTS (${posts.length}, newest first; id | platform | date | stats | text)\n` +
    posts
      .map(
        (p) =>
          `${p.externalUrl ?? p.id} | ${p.platform} | ${p.publishedAt?.toISOString().slice(0, 10)} | ${JSON.stringify(p.stats ?? {})} | ${(p.text ?? "").replace(/\s+/g, " ").slice(0, 400)}`,
      )
      .join("\n");

  const { output, usage } = await generateText({
    model: anthropic("claude-sonnet-5"),
    output: Output.object({ schema: BASELINE }),
    prompt:
      `You are drafting a marketing BASELINE for a brand from observed evidence only. ` +
      `A human will review it; pillars and personas are PROPOSALS, not decisions.\n` +
      `Rules:\n- Ground every claim in the evidence below and cite post URLs/ids in "evidence".\n` +
      `- If the posts are few or missing, say so in "gaps" and lean on the website evidence, flagging lower confidence.\n` +
      `- Personas are few and stable (who we talk to); do not create geo/age variants as separate personas.\n` +
      `- Pillars are durable content themes, 3-5, each distinct.\n\n` +
      evidence,
  });

  const baseline = {
    cadence,
    topPosts,
    postsConsidered: posts.length,
    ...output,
  };
  console.log("\n" + JSON.stringify(baseline, null, 2));
  return {
    result: { baseline, usage },
    note: `${posts.length} posts, ${usage?.totalTokens ?? "?"} tokens`,
  };
});

// ---- summary -----------------------------------------------------------------

console.log("\n=== summary ===");
for (const s of report.stages) {
  console.log(
    `${s.stage.padEnd(9)} ${s.status.padEnd(8)} ${(s.ms / 1000).toFixed(1).padStart(6)}s  ${s.note ?? s.error?.split("\n")[0] ?? ""}`,
  );
}
console.log(`\nreport: ${OUT}`);
process.exit(0);
