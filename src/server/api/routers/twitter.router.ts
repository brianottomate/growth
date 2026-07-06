import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure } from "../trpc";
import {
  DRAFT_PILLS,
  INTENT_TAGS,
} from "@/server/services/reddit-monitor.service";
import {
  draftTweetReplyForPost,
  scanAndScoreTweets,
} from "@/server/services/twitter-monitor.service";

export const twitterRouter = {
  scanNow: protectedProcedure.mutation(async () => {
    return scanAndScoreTweets();
  }),

  draftReply: protectedProcedure
    .input(
      z.object({
        tweet: z.object({
          id: z.string(),
          text: z.string(),
          authorUsername: z.string(),
          authorName: z.string(),
          url: z.string(),
          createdAt: z.string(),
          likeCount: z.number(),
          replyCount: z.number(),
          retweetCount: z.number(),
        }),
        intentTag: z.enum(INTENT_TAGS),
        rationale: z.string(),
        pills: z.array(z.enum(DRAFT_PILLS)).optional(),
        customInstructions: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const draft = await draftTweetReplyForPost(input);
      return { draft };
    }),
} satisfies TRPCRouterRecord;
