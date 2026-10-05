import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { and, asc, between, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { z } from "zod";

import { db, withTransaction } from "../db";
import { reconcileAmplificationTargetsForPosts } from "./amplification.service";
import {
  amplificationTargetTable,
  contentPostTable,
  platformPostLinkTable,
  platformPostTable,
} from "../db/schema";

/**
 * Join a spot we planned to the live post it actually became.
 *
 * The team plans in Growth, then posts by hand in the app. Both halves end up
 * in `platform_post` as two unrelated rows: our spot carries the idea, the brief
 * and the pillar with an empty caption; the provider sync carries the real
 * caption, media, permalink and stats with no idea. Nothing joins them, so
 * planned work and published performance are separate universes.
 *
 * The join is a judgement call, not a key lookup. Measured on the June 2026
 * Instagram set: ship dates drift one to two days off the plan, and the local
 * side has no caption at all, only a brief. What does line up is the brief's
 * hook against the real caption's first line, reworded ("Big Sur has a tourist
 * version. This is the real one." became "Big Sur has a tourist version. This
 * isn't it."). String similarity misses that; a model gets it right and says so.
 */

const MATCH_MODEL = "claude-sonnet-5";
const DEFAULT_WINDOW_DAYS = 4;
const MAX_CANDIDATES = 15;
const MAX_CAPTION_CHARS = 700;

const MATCH_SCHEMA = z.object({
  livePlatformPostId: z
    .string()
    .nullable()
    .describe("id of the matching live row, or null when none convince you"),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

function windowAround(anchor: Date, days: number): [Date, Date] {
  const span = days * 24 * 60 * 60 * 1000;
  return [new Date(anchor.getTime() - span), new Date(anchor.getTime() + span)];
}

async function loadSpot(platformPostId: string) {
  const spot = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, platformPostId),
    with: { contentPost: true },
  });
  if (!spot) throw new Error("That spot no longer exists.");
  return spot;
}

/**
 * Live rows on the same account near the same date that no idea has claimed.
 * Bounded by date because the shortlist is what keeps this one cheap call: the
 * model picks from a handful, it never searches the archive.
 */
export async function liveCandidatesForSpot(input: {
  platformPostId: string;
  windowDays?: number;
}) {
  const spot = await loadSpot(input.platformPostId);
  const anchor =
    spot.publishedAt ??
    spot.scheduledAt ??
    spot.contentPost?.plannedAt ??
    spot.createdAt;
  const [from, to] = windowAround(
    anchor,
    input.windowDays ?? DEFAULT_WINDOW_DAYS,
  );
  const candidates = await db
    .select({
      id: platformPostTable.id,
      externalId: platformPostTable.externalId,
      externalUrl: platformPostTable.externalUrl,
      publishedAt: platformPostTable.publishedAt,
      format: platformPostTable.format,
      archetype: platformPostTable.archetype,
      text: platformPostTable.text,
    })
    .from(platformPostTable)
    .where(
      and(
        eq(platformPostTable.brandId, spot.brandId),
        eq(platformPostTable.platform, spot.platform),
        ne(platformPostTable.id, spot.id),
        isNull(platformPostTable.contentPostId),
        isNotNull(platformPostTable.externalId),
        between(platformPostTable.publishedAt, from, to),
      ),
    )
    .orderBy(asc(platformPostTable.publishedAt))
    .limit(MAX_CANDIDATES);
  return { spot, candidates, window: { from, to } };
}

export async function proposeLivePostMatch(input: {
  platformPostId: string;
  windowDays?: number;
}) {
  const { spot, candidates, window } = await liveCandidatesForSpot(input);
  if (!candidates.length) {
    return {
      spot,
      candidates,
      window,
      match: null,
      // Naming the sync is the whole value of this branch: a post made this
      // morning has no row here until the provider pull has run.
      note: `No unclaimed live ${spot.platform} post for this brand between ${window.from.toISOString().slice(0, 10)} and ${window.to.toISOString().slice(0, 10)}. Run sourceSyncWrite.syncOwnedContent for the brand and try again, or widen windowDays.`,
    };
  }
  const idea = spot.contentPost;
  const { output } = await generateText({
    model: anthropic(MATCH_MODEL),
    output: Output.object({ schema: MATCH_SCHEMA }),
    prompt: `A Wander marketer planned this post in our back-office, then published it by hand on the platform. Identify which live post it became.

PLANNED SPOT (ours)
platform: ${spot.platform}
format: ${spot.format ?? "(none)"}
planned ship date: ${(spot.scheduledAt ?? idea?.plannedAt ?? spot.publishedAt)?.toISOString() ?? "(none)"}
title: ${idea?.title ?? "(none)"}
hook: ${idea?.hook ?? "(none)"}
caption direction: ${idea?.captionDirection ?? "(none)"}
visual direction: ${idea?.visualDirection ?? "(none)"}
CTA: ${idea?.ctaText ?? "(none)"}

LIVE POSTS ON THAT ACCOUNT (candidates)
${JSON.stringify(
  candidates.map((candidate) => ({
    livePlatformPostId: candidate.id,
    publishedAt: candidate.publishedAt,
    format: candidate.format,
    archetype: candidate.archetype,
    permalink: candidate.externalUrl,
    caption: (candidate.text ?? "").slice(0, MAX_CAPTION_CHARS),
  })),
  null,
  1,
)}

The hook is often the first line of the real caption, reworded. The real ship date can drift a day or two from the planned date. The live format should agree with ours (reel/video, carousel, image); a disagreement is evidence against a match. If nothing is a convincing match, return null and say why. Do not guess to be helpful.`,
  });
  const matched =
    candidates.find(
      (candidate) => candidate.id === output.livePlatformPostId,
    ) ?? null;
  return {
    spot,
    candidates,
    window,
    match: matched
      ? {
          livePlatformPostId: matched.id,
          externalUrl: matched.externalUrl,
          publishedAt: matched.publishedAt,
          confidence: output.confidence,
          reasoning: output.reasoning,
        }
      : null,
    note: matched ? null : `No confident match: ${output.reasoning}`,
  };
}

/**
 * Fold the live row into the planned spot and drop the duplicate.
 *
 * The planned spot stays canonical because it is the row the idea, the pillar
 * and the owner hang off. It inherits the provider identity, which is what makes
 * this stick: ingest identity is brand + platform + externalId, so every later
 * provider pull merges into this row instead of re-inserting the twin we just
 * removed.
 */
export async function applyLivePostMatch(input: {
  platformPostId: string;
  livePlatformPostId: string;
}) {
  const result = await withTransaction(async (tx) => {
    const [spot] = await tx
      .select()
      .from(platformPostTable)
      .where(eq(platformPostTable.id, input.platformPostId))
      .limit(1);
    const [live] = await tx
      .select()
      .from(platformPostTable)
      .where(eq(platformPostTable.id, input.livePlatformPostId))
      .limit(1);
    if (!spot || !live) throw new Error("One of those rows no longer exists.");
    if (spot.brandId !== live.brandId || spot.platform !== live.platform) {
      throw new Error(
        "Those two rows are different brands or platforms, so they cannot be the same post.",
      );
    }
    if (!live.externalId) {
      throw new Error(
        "That row has no provider id, so it is not a live post to merge.",
      );
    }
    if (live.contentPostId && live.contentPostId !== spot.contentPostId) {
      throw new Error(
        "That live post is already attached to another content idea.",
      );
    }

    await tx
      .update(platformPostTable)
      .set({
        status: "published" as const,
        source: "owned" as const,
        externalId: live.externalId,
        externalUrl: live.externalUrl ?? spot.externalUrl,
        publishedAt: live.publishedAt ?? spot.publishedAt ?? new Date(),
        provider: spot.provider ?? "native",
        ingestProvider: live.ingestProvider ?? spot.ingestProvider,
        // The live copy is what the audience read, so it wins over an empty
        // planned caption. A caption edited locally after the fact does not.
        text: spot.text?.trim() ? spot.text : live.text,
        media: spot.media?.length ? spot.media : live.media,
        stats: live.stats ?? spot.stats,
        username: spot.username ?? live.username,
        scrapedAt: live.scrapedAt,
        externalKind: live.externalKind ?? spot.externalKind,
        amplifiedFrom: live.amplifiedFrom ?? spot.amplifiedFrom,
      })
      .where(eq(platformPostTable.id, spot.id));

    // Edges point at posts, not at rows we happen to keep. Repoint before the
    // delete or ON DELETE CASCADE takes real amplification history with it.
    await tx
      .update(platformPostLinkTable)
      .set({ fromPlatformPostId: spot.id })
      .where(eq(platformPostLinkTable.fromPlatformPostId, live.id));
    await tx
      .update(platformPostLinkTable)
      .set({ toPlatformPostId: spot.id })
      .where(eq(platformPostLinkTable.toPlatformPostId, live.id));

    await tx
      .update(amplificationTargetTable)
      .set({ platformPostId: spot.id })
      .where(eq(amplificationTargetTable.platformPostId, live.id));
    await tx
      .update(amplificationTargetTable)
      .set({ outputPlatformPostId: spot.id })
      .where(eq(amplificationTargetTable.outputPlatformPostId, live.id));
    await tx
      .update(amplificationTargetTable)
      .set({ fulfilledByPostId: spot.id })
      .where(eq(amplificationTargetTable.fulfilledByPostId, live.id));
    await tx.delete(platformPostTable).where(eq(platformPostTable.id, live.id));

    let ideaRolledUp: string | null = null;
    if (spot.contentPostId) {
      const siblings = await tx
        .select({ status: platformPostTable.status })
        .from(platformPostTable)
        .where(
          and(
            eq(platformPostTable.contentPostId, spot.contentPostId),
            eq(platformPostTable.source, "owned"),
          ),
        );
      const pending = siblings.filter(
        (sibling) =>
          !["published", "rejected", "archived"].includes(sibling.status),
      );
      if (!pending.length) {
        await tx
          .update(contentPostTable)
          .set({ status: "published" as const })
          .where(eq(contentPostTable.id, spot.contentPostId));
        ideaRolledUp = spot.contentPostId;
      }
    }

    return {
      platformPostId: spot.id,
      mergedRowId: live.id,
      externalId: live.externalId,
      externalUrl: live.externalUrl,
      publishedAt:
        (live.publishedAt ?? spot.publishedAt)?.toISOString() ?? null,
      ideaRolledUp,
    };
  });
  await reconcileAmplificationTargetsForPosts([result.platformPostId]);
  return result;
}
