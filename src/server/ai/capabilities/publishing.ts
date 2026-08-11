import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import { platformPostTable } from "@/server/db/schema";
import {
  approveAndScheduleSocialPost,
  deliverSocialPost,
  rescheduleQueuedSocialPost,
  updateQueuedSocialFirstComment,
} from "@/server/services/content-publishing.service";
import { ContentService } from "@/server/services/content.service";
import { resolveZonedDateTime } from "@/lib/scheduling-time";
import { growthAction, GrowthActionError } from "./types";

async function requireOwnedSocialPost(platformPostId: string, orgId: string) {
  const post = await db.query.platformPostTable.findFirst({
    where: eq(platformPostTable.id, platformPostId),
    with: { brand: true },
  });
  // Split these: a made-up id is not an access problem. Folded together they
  // both read as "organization", which the classifier grades `forbidden` and
  // the model then reports to the operator as missing workspace permissions.
  if (!post) {
    throw new GrowthActionError(
      "not_found",
      `No platform post ${platformPostId} exists. Re-read the work item instead of scheduling an id that was never returned by a read.`,
    );
  }
  if (post.source !== "owned" || post.brand?.organizationId !== orgId) {
    throw new GrowthActionError(
      "forbidden",
      "That owned social post is not available in this organization",
    );
  }
  return post;
}

export const scheduleSocialPost = growthAction({
  description:
    "Approve one complete social publishing unit and schedule it in Zernio. This creates an external provider job and requires explicit approval. A successful Zernio receipt, not the local calendar update, advances the post to scheduled.",
  inputSchema: z.object({
    platformPostId: z.string(),
    timeZone: z
      .string()
      .min(1)
      .describe("IANA timezone used to agree the operator wall-clock time."),
    localDateTime: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/)
      .describe(
        "Agreed operator wall-clock time as YYYY-MM-DDTHH:mm[:ss], without an offset. The server resolves UTC from timeZone.",
      ),
  }),
  execute: async (input, ctx) => {
    await requireOwnedSocialPost(input.platformPostId, ctx.orgId);
    return approveAndScheduleSocialPost({
      platformPostId: input.platformPostId,
      scheduledAt: resolveZonedDateTime(input),
    });
  },
});

export const publishSocialPostNow = growthAction({
  description:
    "Approve one complete social publishing unit and publish it through Zernio now. This is an immediate external provider write and requires explicit approval.",
  inputSchema: z.object({ platformPostId: z.string() }),
  execute: async (input, ctx) => {
    const post = await requireOwnedSocialPost(input.platformPostId, ctx.orgId);
    await ContentService.setPublishingUnitStatus({
      rootPlatformPostId: post.id,
      status: "approved",
    });
    return deliverSocialPost({ platformPostId: post.id, mode: "publish_now" });
  },
});

export const rescheduleSocialPost = growthAction({
  description:
    "Move an existing scheduled Zernio job to a new future time without publishing newer local draft copy or media. Requires explicit approval.",
  inputSchema: z.object({
    platformPostId: z.string(),
    timeZone: z.string().min(1),
    localDateTime: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/),
  }),
  execute: async (input, ctx) => {
    await requireOwnedSocialPost(input.platformPostId, ctx.orgId);
    return rescheduleQueuedSocialPost({
      platformPostId: input.platformPostId,
      scheduledAt: resolveZonedDateTime(input),
    });
  },
});

export const updateScheduledFirstComment = growthAction({
  description:
    "Replace the first comment on an existing scheduled Instagram or LinkedIn Zernio job. This changes the provider job and requires explicit approval.",
  inputSchema: z.object({
    platformPostId: z.string(),
    firstComment: z.string().trim().min(1).max(2_200),
  }),
  execute: async (input, ctx) => {
    await requireOwnedSocialPost(input.platformPostId, ctx.orgId);
    return updateQueuedSocialFirstComment(input);
  },
});
