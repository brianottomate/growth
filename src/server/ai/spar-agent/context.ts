import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  mentionTable,
  normalizeSubreddits,
  type Mention,
  type SubredditProfile,
} from "@/server/db/listening-schema";
import { loadListeningContext } from "@/server/services/listening-config.service";

const REDDIT_ADAPTER = "reddit-json";

export interface MentionSparContext {
  mention: Mention;
  subreddit: SubredditProfile | null;
  /** The volatile block injected after the persona — the actual thing to reason about. */
  contextText: string;
}

/**
 * Load everything the spar agent reasons about for one mention: the mention row
 * itself plus the evaluated profile of its subreddit (resolved from the Reddit
 * listening source config). Returns null if the mention is gone.
 */
export async function loadMentionSparContext(
  mentionId: string,
): Promise<MentionSparContext | null> {
  const [mention] = await db
    .select()
    .from(mentionTable)
    .where(eq(mentionTable.id, mentionId))
    .limit(1);
  if (!mention) return null;

  let subreddit: SubredditProfile | null = null;
  if (mention.subreddit) {
    const { sourceConfig } = await loadListeningContext(REDDIT_ADAPTER);
    subreddit =
      normalizeSubreddits(sourceConfig?.subreddits).find(
        (s) => s.name.toLowerCase() === mention.subreddit!.toLowerCase(),
      ) ?? null;
  }

  return { mention, subreddit, contextText: buildContextText(mention, subreddit) };
}

function buildContextText(m: Mention, sub: SubredditProfile | null): string {
  const lines: string[] = ["# The mention"];
  lines.push(
    `Source: ${m.source}${m.subreddit ? ` · r/${m.subreddit}` : ""}${m.sourceType ? ` · ${m.sourceType}` : ""}`,
  );
  if (m.author) lines.push(`Author: ${m.author}`);
  if (m.keyword) lines.push(`Matched keyword: ${m.keyword}`);
  if (m.title) lines.push(`Title: ${m.title}`);
  if (m.snippet) lines.push(`Text: ${m.snippet}`);
  lines.push(`Link: ${m.url}`);
  if (m.relevance != null)
    lines.push(
      `AI score: ${m.relevance}/10${m.intentTag ? ` · intent ${m.intentTag}` : ""}${m.suggestedAction ? ` · suggested ${m.suggestedAction}` : ""}`,
    );
  if (m.rationale) lines.push(`AI rationale: ${m.rationale}`);
  lines.push(`Current status: ${m.status}`);
  if (m.decisionNote) lines.push(`Prior decision note: ${m.decisionNote}`);

  if (sub) {
    lines.push("", `# Subreddit profile — r/${sub.name}`);
    if (sub.stance) lines.push(`Stance: ${sub.stance}`);
    if (sub.riskFlags?.length) lines.push(`Risks: ${sub.riskFlags.join(", ")}`);
    if (sub.sanctionedPath) lines.push(`Sanctioned path: ${sub.sanctionedPath}`);
    if (sub.cultureSummary) lines.push(`Culture: ${sub.cultureSummary}`);
    if (sub.voiceNotes) lines.push(`Voice here: ${sub.voiceNotes}`);
    if (sub.signalNotes) lines.push(`Signal here: ${sub.signalNotes}`);
  } else if (m.subreddit) {
    lines.push(
      "",
      `# Subreddit profile — r/${m.subreddit}`,
      "Not yet evaluated. Treat its norms as unknown and lean cautious; suggest evaluating it.",
    );
  }
  return lines.join("\n");
}
