import { z } from "zod";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
export const scheduleSocialPostOutputSchema = z.union([
  z.strictObject({
    deliveryStatus: z.string(),
    externalUrl: z.string().nullable(),
    zernioPostId: z.string().nullable(),
  }),
  z.strictObject({
    deliveryStatus: z.string(),
    frameCount: z.number(),
    handedOffCount: z.number(),
  }),
]);

export const publishSocialPostNowOutputSchema = z.union([
  z.strictObject({
    deliveryStatus: z.string(),
    externalUrl: z.string().nullable(),
    zernioPostId: z.string().nullable(),
  }),
  z.strictObject({
    deliveryStatus: z.string(),
    frameCount: z.number(),
    handedOffCount: z.number(),
  }),
]);

export const rescheduleSocialPostOutputSchema = z.union([
  z.strictObject({
    deliveryStatus: z.string(),
    externalUrl: z.string().nullable(),
    zernioPostId: z.string().nullable(),
  }),
  z.strictObject({
    deliveries: z.array(
      z.strictObject({
        deliveryStatus: z.string(),
        externalUrl: z.string().nullable(),
        zernioPostId: z.string().nullable(),
      }),
    ),
    platformPostId: z.string(),
    scheduledAt: z.string(),
  }),
]);

export const updateScheduledFirstCommentOutputSchema = z.strictObject({
  deliveryStatus: z.string(),
  firstCommentStatus: z.string(),
  platformPostId: z.string(),
  providerPostId: z.string(),
});

export const recordExternalPublishOutputSchema = z.strictObject({
  ideasRolledUpToPublished: z.array(z.string()),
  missingPermalink: z.boolean(),
  ok: z.literal(true),
  publishedAt: z.string(),
  publishedPlatformPostIds: z.array(z.string()),
  skippedWithQueuedProviderJob: z.array(z.string()),
});

export const proposeLivePostOutputSchema = z.strictObject({
  candidatesConsidered: z.array(
    z.strictObject({
      captionOpening: z.string(),
      format: z.string().nullable(),
      livePlatformPostId: z.string(),
      permalink: z.string().nullable(),
      publishedAt: z.iso.datetime().nullable(),
    }),
  ),
  match: z
    .strictObject({
      confidence: z.number(),
      externalUrl: z.string().nullable(),
      livePlatformPostId: z.string(),
      publishedAt: z.iso.datetime().nullable(),
      reasoning: z.string(),
    })
    .nullable(),
  note: z.string().nullable(),
  ok: z.literal(true),
});

export const applyLivePostMatchActionOutputSchema = z.strictObject({
  externalId: z.string(),
  externalUrl: z.string().nullable(),
  ideaRolledUp: z.string().nullable(),
  mergedRowId: z.string(),
  ok: z.literal(true),
  platformPostId: z.string(),
  publishedAt: z.string().nullable(),
});

/** Native service result; the existing wire contract validates its JSON projection. */
export const proposeLivePostNativeResultSchema =
  proposeLivePostOutputSchema.extend({
    candidatesConsidered: z.array(
      proposeLivePostOutputSchema.shape.candidatesConsidered.element.extend({
        publishedAt: z.date().nullable(),
      }),
    ),
    match: proposeLivePostOutputSchema.shape.match
      .unwrap()
      .extend({ publishedAt: z.date().nullable() })
      .nullable(),
  });
