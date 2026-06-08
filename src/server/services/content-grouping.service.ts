import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import {
  type ChannelPlatform,
  contentSuggestionTable,
  platformPostTable,
} from "@/server/db/schema";

/**
 * Retroactive content grouping — reconstruct the `content_post` (idea) layer
 * over orphaned `platform_post`s. An AI pass (structured generation) clusters a
 * brand's posts into groups: the SAME content cross-posted, a recurring SERIES
 * ("Where to Stay" guides), a campaign, or a theme. Each group is written as a
 * PENDING `content_suggestion` (kind="grouping") for human review in /content.
 *
 * Batched + paginated so large libraries (blog 300, newsletter 238) stay within
 * one model call each. Cross-batch series won't merge — acceptable for v1.
 */

const MODEL = "claude-sonnet-4-6";
const BATCH = 100;

const GroupingsSchema = z.object({
  groups: z
    .array(
      z.object({
        unit: z
          .string()
          .describe(
            "'single' = ONE piece shown many ways (same content cross-posted across channels/time, incl. within-brand reposts amplifying it) → becomes one content idea. 'series' = MULTIPLE DISTINCT pieces sharing a recurring format or one campaign arc → becomes a series of separate ideas.",
          ),
        title: z
          .string()
          .describe("short group/series name, e.g. 'Where to Stay city guides'"),
        groupKind: z
          .string()
          .describe("descriptive: crosspost | series | campaign | theme"),
        theme: z.string().describe("what unifies these posts"),
        members: z
          .array(z.number())
          .describe("0-based indexes of the posts in this group; only 2 or more"),
        rationale: z.string().describe("one sentence on why they group"),
      }),
    )
    .describe("content groups found in this batch (omit standalone posts)"),
});

const SYSTEM = `You reconstruct the content-idea layer over a brand's published posts.

Each group has a UNIT:
- "single": ONE piece of content shown multiple ways — the same post cross-posted
  to several channels, possibly at different times, INCLUDING within-brand
  reposts/quotes (marked "↻ repost of @x" / "❝ quote of @x") that amplify it
  (e.g. a launch announcement + the reposts boosting it). Becomes ONE content idea.
- "series": MULTIPLE DISTINCT pieces that share a recurring format or one campaign
  arc (e.g. "Where to Stay in {city}" guides, a weekly "Property Spotlight", a
  multi-week launch campaign). Becomes a SERIES of separate ideas.

STRONG bias toward leaving posts STANDALONE:
- Most posts are one-off originals — do NOT group them. Standalone is the norm.
- Only group when the signal is clear: shared title/template pattern, the same
  content, or one campaign.
- Do NOT group scattered or unrelated reposts. Only fold a repost into a group
  if it clearly amplifies THAT group's content/campaign.
- Prefer precise small groups over big loose buckets.

Return only groups of 2+; everything else stays standalone (omit it). Use the
[index] shown in brackets to reference posts.`;

export type GroupingRun = {
  posts: number;
  groups: number;
  suggestions: number;
};

export async function suggestGroupingsForBrand(opts: {
  brandId: string;
  platforms: ChannelPlatform[];
  source?: "owned" | "scraped";
}): Promise<GroupingRun> {
  const rows = await db
    .select({
      id: platformPostTable.id,
      platform: platformPostTable.platform,
      text: platformPostTable.text,
      meta: platformPostTable.metadata,
      at: platformPostTable.publishedAt,
      externalKind: platformPostTable.externalKind,
      amplifiedFrom: platformPostTable.amplifiedFrom,
    })
    .from(platformPostTable)
    .where(
      and(
        eq(platformPostTable.brandId, opts.brandId),
        inArray(platformPostTable.platform, opts.platforms),
        opts.source ? eq(platformPostTable.source, opts.source) : undefined,
      ),
    )
    // Chronological so same-day cross-posts across platforms share a batch
    // (lets the model detect crosspost clusters).
    .orderBy(platformPostTable.publishedAt);

  const posts = rows.map((r) => {
    const meta = (r.meta ?? {}) as { tags?: unknown };
    const tags = Array.isArray(meta.tags) ? meta.tags.join(",") : "";
    // Amplification is a SIGNAL, not an exclusion — reposts/quotes are core to
    // campaigns (a founder amplifying a launch belongs in that campaign group).
    const kind = r.externalKind ?? "";
    const who = (r.amplifiedFrom)?.username;
    const amp =
      kind === "repost" || kind === "retweet"
        ? `↻ repost${who ? ` of @${who}` : ""}`
        : kind === "quote"
          ? `❝ quote${who ? ` of @${who}` : ""}`
          : "";
    return {
      id: r.id,
      platform: r.platform,
      date: r.at?.toISOString().slice(0, 10) ?? "",
      title: (r.text ?? "").slice(0, 120).replace(/\s+/g, " ").trim(),
      tags,
      amp,
    };
  });

  let groups = 0;
  let suggestions = 0;

  for (let i = 0; i < posts.length; i += BATCH) {
    const batch = posts.slice(i, i + BATCH);
    const list = batch
      .map(
        (p, idx) =>
          `[${idx}] ${p.platform} | ${p.date}${p.amp ? ` | ${p.amp}` : ""} | ${p.title}${p.tags ? ` | tags: ${p.tags}` : ""}`,
      )
      .join("\n");

    const { output } = await generateText({
      model: anthropic(MODEL),
      output: Output.object({
        name: "ContentGroupings",
        description: "Editorial groupings over a brand's posts",
        schema: GroupingsSchema,
      }),
      system: SYSTEM,
      prompt: `Posts:\n${list}`,
    });

    for (const g of output.groups) {
      const memberIds = g.members
        .map((idx) => batch[idx]?.id)
        .filter((x): x is string => !!x);
      if (memberIds.length < 2) continue;
      groups++;
      await db.insert(contentSuggestionTable).values({
        brandId: opts.brandId,
        kind: "grouping",
        subjectPostId: memberIds[0]!,
        proposed: {
          unit: g.unit,
          groupKind: g.groupKind,
          title: g.title,
          theme: g.theme,
          memberPostIds: memberIds,
          rationale: g.rationale,
        },
        confidence: 0.7,
        reasoning: g.rationale,
        source: "content-grouping",
      });
      suggestions++;
    }
  }

  return { posts: posts.length, groups, suggestions };
}
