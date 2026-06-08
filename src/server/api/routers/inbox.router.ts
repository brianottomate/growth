import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure } from "../trpc";
import {
  getZernioConversationMessages,
  getZernioPostComments,
  listAllDmConversations,
} from "@/server/clients/zernio.client";
import {
  DM_DRAFT_PILLS,
  DM_INTENT_TAGS,
  draftDmReply,
  triageConversations,
  type ConversationInput,
} from "@/server/services/inbox-triage.service";
import {
  COMMENT_DRAFT_PILLS,
  COMMENT_INTENT_TAGS,
  draftCommentReply,
  triageComments,
} from "@/server/services/comment-triage.service";

export const inboxRouter = {
  /**
   * On-demand triage: re-fetches conversations live and scores their previews
   * (intent / priority / suggested-action). Nothing is persisted — the ranking
   * lives in the client until the next run.
   */
  triageNow: protectedProcedure.mutation(async () => {
    const { conversations } = await listAllDmConversations({ perPlatformLimit: 50 });
    const inputs: ConversationInput[] = conversations
      .filter((c) => typeof c.id === "string")
      .map((c) => ({
        id: c.id!,
        platform: c.platform,
        participantName: c.participantName,
        participantUsername: c.participantUsername,
        lastMessage: c.lastMessage,
        unreadCount: c.unreadCount,
        followerCount: c.instagramProfile?.followerCount,
        isVerified: c.instagramProfile?.isVerified,
      }));
    return triageConversations(inputs);
  }),

  /** Fetch a single conversation's thread (oldest→newest). */
  getThread: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        accountId: z.string(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    )
    .query(async ({ input }) => {
      const { messages } = await getZernioConversationMessages(
        input.conversationId,
        { accountId: input.accountId, limit: input.limit ?? 50 },
      );
      return { messages };
    }),

  /**
   * On-demand triage of organic comments. The client passes the loaded comment
   * set (id + text + post context); we score intent/priority. Ephemeral.
   */
  triageComments: protectedProcedure
    .input(
      z.object({
        comments: z.array(
          z.object({
            id: z.string(),
            platform: z.string().optional(),
            author: z.string().optional(),
            postContent: z.string().optional(),
            message: z.string(),
          }),
        ),
      }),
    )
    .mutation(async ({ input }) => {
      return triageComments(input.comments);
    }),

  /** On-demand reply draft for a single comment. Ephemeral. */
  draftCommentReply: protectedProcedure
    .input(
      z.object({
        platform: z.string().optional(),
        author: z.string().optional(),
        postContent: z.string().optional(),
        message: z.string(),
        intentTag: z.enum(COMMENT_INTENT_TAGS).optional(),
        rationale: z.string().optional(),
        pills: z.array(z.enum(COMMENT_DRAFT_PILLS)).optional(),
        customInstructions: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const draft = await draftCommentReply(input);
      return { draft };
    }),

  /** Individual comments on a single organic post (the Comments drill-down). */
  postComments: protectedProcedure
    .input(
      z.object({
        postId: z.string(),
        accountId: z.string(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    )
    .query(async ({ input }) => {
      const { comments } = await getZernioPostComments(input.postId, {
        accountId: input.accountId,
        limit: input.limit ?? 50,
      });
      return { comments };
    }),

  /** On-demand reply draft from a conversation thread. Ephemeral. */
  draftReply: protectedProcedure
    .input(
      z.object({
        participantName: z.string().optional(),
        platform: z.string().optional(),
        intentTag: z.enum(DM_INTENT_TAGS).optional(),
        rationale: z.string().optional(),
        thread: z.string(),
        pills: z.array(z.enum(DM_DRAFT_PILLS)).optional(),
        customInstructions: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const draft = await draftDmReply(input);
      return { draft };
    }),
} satisfies TRPCRouterRecord;
