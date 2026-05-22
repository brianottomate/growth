import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure } from "../trpc";
import {
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
  scanNow: protectedProcedure.mutation(async () => {
    return scanAndScore();
  }),

  /**
   * Generates a Reddit-appropriate reply draft for a scored post.
   * Caller passes the post + the analyst's scoring context so the draft can
   * tailor tone (e.g. critical brand mentions get an acknowledge/apology, not
   * a pitch).
   */
  draftReply: protectedProcedure
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
      }),
    )
    .mutation(async ({ input }) => {
      const draft = await draftReplyForPost(input);
      return { draft };
    }),
} satisfies TRPCRouterRecord;
