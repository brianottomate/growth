import "server-only";

import { z } from "zod";
import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { MENTION_SOURCES, mentionTable } from "@/server/db/listening-schema";
import { growthAction } from "./types";

/**
 * Recent social mentions from the listening pipeline. Like `leads`, the
 * listening tables are single-tenant/global here, so this mirrors the
 * `mention.list` tRPC query rather than scoping by org.
 */
export const recentMentions = growthAction({
  description:
    "List recent social mentions captured by the listening pipeline (Reddit/X/etc.), newest first. Each carries the source, author, a snippet, and the system's suggestedAction (engage | monitor | skip) + relevance score. Use for 'what are people saying / any mentions worth replying to / what's in the listening queue' questions. Set onlyEngageWorthy to surface just the act-today items.",
  inputSchema: z.object({
    source: z.enum(MENTION_SOURCES).optional(),
    onlyEngageWorthy: z
      .boolean()
      .default(false)
      .describe("only mentions the system tagged suggestedAction='engage'"),
    limit: z.number().int().min(1).max(50).default(15),
  }),
  execute: async (input) => {
    const rows = await db
      .select({
        id: mentionTable.id,
        title: mentionTable.title,
        source: mentionTable.source,
        subreddit: mentionTable.subreddit,
        author: mentionTable.author,
        url: mentionTable.url,
        keyword: mentionTable.keyword,
        relevance: mentionTable.relevance,
        intentTag: mentionTable.intentTag,
        suggestedAction: mentionTable.suggestedAction,
        status: mentionTable.status,
        receivedAt: mentionTable.receivedAt,
      })
      .from(mentionTable)
      .where(input.source ? eq(mentionTable.source, input.source) : undefined)
      .orderBy(desc(mentionTable.receivedAt))
      .limit(input.limit);

    const active = rows.filter((m) => m.status !== "skipped");
    const mentions = input.onlyEngageWorthy
      ? active.filter((m) => m.suggestedAction === "engage")
      : active;

    return { mentions, count: mentions.length };
  },
});
