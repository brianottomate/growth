import "server-only";
import { z } from "zod";
import { reviewTargetSchema } from "@/lib/review-target";
import { growthAction } from "./types";
import {
  addReviewComment,
  deleteReviewComment,
  listReviewComments,
} from "@/server/services/review-comments.service";

export const reviewCommentSchema = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.string(),
  authorId: z.string(),
  actorKind: z.enum(["user", "agent"]),
  viaAgent: z.boolean(),
  event: z.enum(["comment", "return_to_studio"]),
  authorName: z.string().nullable(),
  authorImage: z.string().nullable(),
  author: z.object({
    id: z.string(),
    name: z.string().nullable(),
    image: z.string().nullable(),
  }),
});
export const listReviewCommentsAction = growthAction({
  description:
    "Read the latest 100 internal review comments for an owned ad, catalog home card, or parent content post. These are team discussions, not audience comments.",
  inputSchema: z.object({ target: reviewTargetSchema }),
  outputSchema: z.array(reviewCommentSchema),
  execute: (input, ctx) => listReviewComments(input.target, ctx.orgId),
});
export const addReviewCommentAction = growthAction({
  description:
    "Add an internal review comment to an owned ad, catalog card, or parent content post. Default as=agent attributes your observation to Growth assistant for the authenticated user. Use as=user only when the user explicitly asks you to post their words; it is displayed as the user via Growth assistant. Never claim another user's identity. Does not approve, publish, notify externally or change review state.",
  inputSchema: z.object({
    target: reviewTargetSchema,
    body: z.string().trim().min(1).max(8000),
    as: z.enum(["user", "agent"]).default("agent"),
  }),
  outputSchema: z.object({ id: z.string() }),
  execute: addReviewComment,
});
export const deleteReviewCommentAction = growthAction({
  description:
    "Soft-delete one of the authenticated user's internal comments. System events cannot be removed.",
  inputSchema: z.object({ id: z.string().min(1) }),
  outputSchema: z.object({ id: z.string() }),
  execute: (input, ctx) => deleteReviewComment(input.id, ctx),
});
