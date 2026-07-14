import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandTable,
  type ChannelPlatform,
  contentPostTable,
  contentSuggestionTable,
  platformPostTable,
  seriesTable,
} from "@/server/db/schema";
import {
  listBrandPillars,
  requireBrandPillar,
} from "@/server/services/content-strategy.service";

/**
 * Retroactive content grouping — reconstruct the `content_post` (idea) layer
 * over orphaned `platform_post`s. An AI pass (structured generation) clusters a
 * brand's posts into groups: the SAME content cross-posted or a recurring SERIES
 * ("Where to Stay" guides). Pillar is an optional classification on either
 * outcome, not a third grouping container. Each group is written as a
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
          .enum(["single", "series"])
          .describe(
            "'single' = ONE piece shown many ways (same content cross-posted across channels/time, incl. within-brand reposts amplifying it) → becomes one content idea. 'series' = MULTIPLE DISTINCT pieces sharing a recurring format or one campaign arc → becomes a series of separate ideas.",
          ),
        title: z
          .string()
          .describe(
            "short group/series name, e.g. 'Where to Stay city guides'",
          ),
        groupKind: z
          .enum(["crosspost", "series"])
          .describe(
            "crosspost for multiple executions/amplifications of one idea; series for multiple distinct installments",
          ),
        theme: z.string().describe("what unifies these posts"),
        pillarSlug: z
          .string()
          .nullable()
          .describe(
            "one supplied brand pillar slug when the fit is clear; otherwise null",
          ),
        members: z
          .array(z.number())
          .describe(
            "0-based indexes of the posts in this group; only 2 or more",
          ),
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
- Do not invent additional grouping types such as theme or campaign. A broad
  theme is a pillar classification; an editorial campaign arc is a series.
- A pillar classifies the resulting idea or series. It never replaces the
  single-vs-series decision and must use one of the supplied pillar slugs.

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
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, opts.brandId),
    columns: { id: true, slug: true },
  });
  if (!brand) throw new Error("Brand not found");
  const pillars = await listBrandPillars({
    brandId: brand.id,
    brandSlug: brand.slug,
  });
  const pillarContext = pillars.length
    ? pillars
        .map(
          (pillar) =>
            `- ${pillar.slug}: ${pillar.name} — ${pillar.description}`,
        )
        .join("\n")
    : "- No pillars are defined. Always return pillarSlug: null.";
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
    const who = r.amplifiedFrom?.username;
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
      prompt: `Available brand pillars:\n${pillarContext}\n\nPosts:\n${list}`,
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
          pillarSlug: g.pillarSlug,
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

/** Apply or reject one reviewable grouping proposal. Both the Review screen
 * and chat call this service so approval semantics cannot drift between them. */
export async function resolveGroupingSuggestion(input: {
  id: string;
  accept: boolean;
  orgId: string;
  userId: string;
  pillarSlug?: string | null;
}) {
  const suggestion = await db.query.contentSuggestionTable.findFirst({
    where: eq(contentSuggestionTable.id, input.id),
    with: {
      brand: { columns: { organizationId: true, slug: true } },
    },
  });
  if (!suggestion) throw new Error("Grouping proposal not found.");
  if (suggestion.brand?.organizationId !== input.orgId) {
    throw new Error("Grouping proposal is outside your organization.");
  }
  if (suggestion.status !== "pending") {
    throw new Error("This grouping proposal has already been reviewed.");
  }

  const review = { reviewedById: input.userId, reviewedAt: new Date() };
  if (!input.accept) {
    await db
      .update(contentSuggestionTable)
      .set({ status: "rejected", ...review })
      .where(eq(contentSuggestionTable.id, suggestion.id));
    return {
      ok: true as const,
      action: "saved" as const,
      change: "rejected" as const,
      id: suggestion.id,
      status: "rejected" as const,
    };
  }

  const proposed = (suggestion.proposed ?? {}) as {
    unit?: "single" | "series";
    title?: string;
    theme?: string;
    pillarSlug?: string | null;
    memberPostIds?: string[];
  };
  const pillarSlug =
    input.pillarSlug === undefined
      ? (proposed.pillarSlug ?? null)
      : input.pillarSlug;
  if (pillarSlug) {
    await requireBrandPillar({
      brandId: suggestion.brandId,
      brandSlug: suggestion.brand.slug,
      pillarSlug,
    });
  }
  const ids = [...new Set(proposed.memberPostIds ?? [])];
  const members = ids.length
    ? await db.query.platformPostTable.findMany({
        where: and(
          inArray(platformPostTable.id, ids),
          eq(platformPostTable.brandId, suggestion.brandId),
        ),
        columns: { id: true, text: true, publishedAt: true },
      })
    : [];
  if (members.length !== ids.length || members.length < 2) {
    throw new Error(
      "The grouping no longer contains at least two available posts for this brand.",
    );
  }

  if (proposed.unit === "series") {
    const dates = members
      .map((member) => member.publishedAt)
      .filter((date): date is Date => !!date)
      .sort((a, b) => a.getTime() - b.getTime());
    const [series] = await db
      .insert(seriesTable)
      .values({
        brandId: suggestion.brandId,
        name: proposed.title ?? "Series",
        theme: proposed.theme,
        pillar: pillarSlug,
        status: "active",
        startAt: dates[0],
        endAt: dates[dates.length - 1],
      })
      .returning({ id: seriesTable.id, name: seriesTable.name });
    if (!series) throw new Error("Could not create the series.");

    for (const member of members) {
      const [idea] = await db
        .insert(contentPostTable)
        .values({
          brandId: suggestion.brandId,
          title: member.text?.slice(0, 100).replace(/\s+/g, " ").trim() ?? null,
          status: "draft",
          origin: "ai",
          seriesId: series.id,
          pillar: pillarSlug,
          metadata: { fromSuggestion: suggestion.id },
        })
        .returning({ id: contentPostTable.id });
      if (idea) {
        await db
          .update(platformPostTable)
          .set({ contentPostId: idea.id })
          .where(eq(platformPostTable.id, member.id));
      }
    }
    await db
      .update(contentSuggestionTable)
      .set({ status: "accepted", ...review })
      .where(eq(contentSuggestionTable.id, suggestion.id));
    return {
      ok: true as const,
      action: "saved" as const,
      change: "series" as const,
      id: suggestion.id,
      status: "accepted" as const,
      seriesId: series.id,
      title: series.name,
      pillarSlug,
      contentIdeas: members.length,
      url: "/app/content",
    };
  }

  const [idea] = await db
    .insert(contentPostTable)
    .values({
      brandId: suggestion.brandId,
      title: proposed.title ?? "Grouped content",
      status: "draft",
      origin: "ai",
      pillar: pillarSlug,
      metadata: {
        groupKind: "crosspost",
        theme: proposed.theme,
        fromSuggestion: suggestion.id,
      },
    })
    .returning({ id: contentPostTable.id, title: contentPostTable.title });
  if (!idea) throw new Error("Could not create the content idea.");
  await db
    .update(platformPostTable)
    .set({ contentPostId: idea.id })
    .where(inArray(platformPostTable.id, ids));
  await db
    .update(contentSuggestionTable)
    .set({ status: "accepted", ...review })
    .where(eq(contentSuggestionTable.id, suggestion.id));
  return {
    ok: true as const,
    action: "saved" as const,
    change: "same_idea" as const,
    id: suggestion.id,
    status: "accepted" as const,
    contentPostId: idea.id,
    title: idea.title,
    pillarSlug,
    channelPosts: members.length,
    url: `/app/content/${idea.id}`,
  };
}
