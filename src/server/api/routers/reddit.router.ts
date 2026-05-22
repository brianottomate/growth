import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

// TODO: re-add publicProcedure on scanNow + draftReply before exposing
// /growth more broadly. Each LLM call costs money; open mutations = abuse risk.
import { publicProcedure } from "../trpc";
import {
  DRAFT_PILLS,
  INTENT_TAGS,
  draftReplyForPost,
  scanAndScore,
} from "@/server/services/reddit-monitor.service";

export const redditRouter = {
  /**
   * Fetches the latest posts from the Tier 1 STR-operator subreddits and
   * runs them through Claude Haiku 4.5 for relevance scoring.
   * Returns the scored list sorted by relevance (desc).
   */
  scanNow: publicProcedure.mutation(async () => {
    return scanAndScore();
  }),

  /**
   * Generates a Reddit-appropriate reply draft for a scored post.
   * Caller passes the post + the analyst's scoring context so the draft can
   * tailor tone (e.g. critical brand mentions get an acknowledge/apology, not
   * a pitch).
   */
  draftReply: publicProcedure
    .input(
      z.object({
        post: z.object({
          id: z.string(),
          subreddit: z.string(),
          title: z.string(),
          body: z.string(),
          author: z.string(),
          url: z.string(),
          createdUtc: z.number(),
          ups: z.number(),
          numComments: z.number(),
        }),
        intentTag: z.enum(INTENT_TAGS),
        rationale: z.string(),
        pills: z.array(z.enum(DRAFT_PILLS)).optional(),
        customInstructions: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const draft = await draftReplyForPost(input);
      return { draft };
    }),
} satisfies TRPCRouterRecord;
