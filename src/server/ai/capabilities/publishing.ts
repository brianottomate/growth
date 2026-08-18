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

/** Surfaces with nothing public to link to. */
const PLATFORMS_WITHOUT_PERMALINKS = ["newsletter", "other"];

export const recordExternalPublish = growthAction({
  description:
    "Record that an owned post already went out OUTSIDE Wander Growth — posted by hand in the app, or sent straight from Customer.io. Local receipt only: no provider job is created and no send-ledger row is written. Use this whenever the operator says something is already live; setting the idea's status alone leaves the calendar, the Feed and the pipeline counts still reading draft, because they read the spot's status. Ask which day it went out and, on a platform that has permalinks, ask for the link before calling this — the ship date is what the calendar and every cadence read afterwards, and the link is the only way analytics ever finds the post again. Refuses a spot with a queued Zernio job: reschedule or publish that one instead.",
  inputSchema: z.object({
    platformPostIds: z
      .array(z.string())
      .min(1)
      .max(12)
      .describe(
        "The spots that actually went out. A thread root brings its ordered children with it. Pass only the channels that really shipped, not every spot under the idea.",
      ),
    timeZone: z
      .string()
      .min(1)
      .describe("IANA timezone the operator stated the ship time in."),
    // Required on purpose. An optional ship time gets silently defaulted to
    // "now", which back-dates nothing and quietly misplaces the post on the
    // calendar; required means the model has to ask the one question only the
    // operator can answer. "Just posted it" is the runtime clock, not a guess.
    localDateTime: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/)
      .describe(
        "When it actually went out, as operator wall-clock YYYY-MM-DDTHH:mm[:ss] without an offset. Ask the operator for the day; use the runtime clock only when they say it just went out. Never infer it from the planned date.",
      ),
    provider: z
      .enum(["native", "manual", "customerio"])
      .optional()
      .describe(
        "How it shipped: native = posted in the platform's own app, customerio = sent from Customer.io, manual = anything else. Defaults to native.",
      ),
    externalUrl: z
      .string()
      .url()
      .optional()
      .describe(
        "Permalink to the live post. Ask for it on any platform that has one: without it the spot can never be matched to its own analytics, and a later provider sync ingests the same post again as a separate scraped row. Omit for newsletters and anywhere no public URL exists.",
      ),
  }),
  execute: async (input, ctx) => {
    const posts = [];
    for (const platformPostId of input.platformPostIds) {
      posts.push(await requireOwnedSocialPost(platformPostId, ctx.orgId));
    }
    // One permalink cannot describe two spots. Applying it to both would put
    // an Instagram URL on the LinkedIn row, so the batch form is for spots
    // that ship as one unit and the link form is one call per spot.
    if (input.externalUrl && input.platformPostIds.length > 1) {
      throw new GrowthActionError(
        "invalid_input",
        "A permalink belongs to one spot. Call this once per spot when you have the links, or drop externalUrl to record the batch without them.",
      );
    }
    const publishedAt = new Date(
      resolveZonedDateTime({
        localDateTime: input.localDateTime,
        timeZone: input.timeZone,
      }),
    );
    const result = await ContentService.recordExternalPublish({
      platformPostIds: input.platformPostIds,
      publishedAt,
      provider: input.provider,
      externalUrl: input.externalUrl ?? null,
    });
    if (!result.platformPostIds.length) {
      throw new GrowthActionError(
        "invalid_input",
        `Nothing was marked published: ${result.liveProviderJobs.join(", ")} still ${result.liveProviderJobs.length === 1 ? "has" : "have"} a queued Zernio job. Publish or reschedule through the provider instead of recording a manual send over it.`,
      );
    }
    return {
      ok: true as const,
      publishedAt: publishedAt.toISOString(),
      publishedPlatformPostIds: result.platformPostIds,
      // Surfaced so the model can offer to go get the link rather than leave a
      // published spot that no analytics pull will ever recognize. A newsletter
      // has no permalink to want, so it never asks for one.
      missingPermalink:
        !input.externalUrl &&
        posts.some(
          (post) => !PLATFORMS_WITHOUT_PERMALINKS.includes(post.platform),
        ),
      // Named so the model reports the idea move it did NOT make: a spot can
      // ship while its siblings are still drafts, and the idea stays open.
      ideasRolledUpToPublished: result.contentPostIds,
      skippedWithQueuedProviderJob: result.liveProviderJobs,
    };
  },
});
