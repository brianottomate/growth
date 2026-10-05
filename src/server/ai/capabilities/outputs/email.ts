import { listingsDigestSchema } from "@/lib/listings-digest";
import { workflowRunStatusEnum } from "@/server/db/creative-work-schema";
import { messageSendStatusEnum } from "@/server/db/email-document-schema";
import { contentStatusEnum } from "@/server/db/content-schema";
import { z } from "zod";

import { newsletterTemplateIds } from "@/lib/newsletter-templates";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
const digestSchema = listingsDigestSchema;

const changeItemSchema = z.strictObject({
  category: z.enum(["fixed", "new", "improved"]),
  customerImpact: z.string().nullable().optional(),
  mergedAt: z.string().nullable().optional(),
  ref: z.string(),
  releaseStatus: z.enum(["shipped", "merged"]),
  repository: z.string(),
  shippedAt: z.string().nullable().optional(),
  summary: z.string(),
  title: z.string(),
  url: z.string().nullable().optional(),
});

const productUpdateSchema = z.strictObject({
  changes: z.array(changeItemSchema),
  periodEnd: z.string(),
  periodStart: z.string(),
});

export const getEmailDraftOutputSchema = z.strictObject({
  brand: z.strictObject({
    id: z.string(),
    name: z.string(),
    slug: z.string().nullable(),
    homeCount: z.number(),
    /** Why Growth cannot send as this brand yet; empty when it can. */
    sendBlockers: z.array(z.string()),
  }),
  canDeliver: z.boolean(),
  content: z
    .strictObject({
      ctaText: z.string().nullable(),
      hook: z.string().nullable(),
      id: z.string(),
      pillar: z.string().nullable(),
      plannedAt: z.iso.datetime().nullable(),
      purpose: z.string().nullable(),
      series: z.strictObject({ id: z.string(), name: z.string() }).nullable(),
      title: z.string(),
    })
    .nullable(),
  document: z.strictObject({
    bodyMarkdown: z.string(),
    createdAt: z.iso.datetime(),
    createdBy: z.string().nullable(),
    ctaLabel: z.string().nullable(),
    ctaUrl: z.string().nullable(),
    digest: digestSchema.nullable().optional(),
    handoffTargetRepo: z.string().nullable(),
    id: z.string(),
    platformPostId: z.string(),
    preheader: z.string().nullable(),
    productUpdate: productUpdateSchema.nullable().optional(),
    subject: z.string(),
    templateKey: z.string(),
    updatedAt: z.iso.datetime(),
  }),
  latestJob: z
    .strictObject({
      id: z.string(),
      status: z.enum(workflowRunStatusEnum.enumValues),
      error: z.string().nullable(),
      createdAt: z.iso.datetime(),
      completedAt: z.iso.datetime().nullable(),
    })
    .optional(),
  messageSends: z.array(
    z.strictObject({
      approvedAt: z.iso.datetime().nullable(),
      audienceKind: z.enum(["wanderos_operators", "guests", "subscribers"]),
      audienceLabel: z.string(),
      audienceReference: z.string(),
      createdAt: z.iso.datetime(),
      error: z.string().nullable(),
      id: z.string(),
      contentHash: z.string(),
      provider: z.enum(["customerio", "postmark"]),
      providerBroadcastId: z.string(),
      providerMessageId: z.string().nullable(),
      sentAt: z.iso.datetime().nullable(),
      status: z.enum(messageSendStatusEnum.enumValues),
    }),
  ),
  spot: z.strictObject({
    format: z.enum(["newsletter.broadcast", "newsletter.blast"]),
    id: z.string(),
    media: z.array(
      z.strictObject({
        assetId: z.string().optional(),
        derivedFrom: z.string().optional(),
        height: z.number().optional(),
        thumbnail: z.string().optional(),
        type: z.enum(["image", "video", "carousel"]),
        url: z.string(),
        width: z.number().optional(),
      }),
    ),
    publishedAt: z.iso.datetime().nullable(),
    scheduledAt: z.iso.datetime().nullable(),
    status: z.enum(contentStatusEnum.enumValues),
  }),
  url: z.string(),
});

export const createEmailSlotOutputSchema = z.strictObject({
  contentPostId: z.string(),
  platformPostId: z.string(),
  url: z.string(),
});

export const createDigestFromRowOutputSchema = z.strictObject({
  contentPostId: z.string(),
  homes: z.number(),
  imagesNeeded: z.array(
    z.strictObject({
      hero: z.boolean(),
      home: z.string(),
      region: z.string(),
      sourceUrl: z.string().nullable().optional(),
    }),
  ),
  missingLinks: z.array(z.string()),
  nextStep: z.string(),
  notes: z.array(z.string()),
  ok: z.literal(true),
  platformPostId: z.string(),
  regions: z.array(z.strictObject({ heading: z.string(), homes: z.number() })),
  title: z.string(),
  url: z.string(),
  wanderMatch: z
    .strictObject({
      matched: z.number(),
      needPick: z.array(z.string()),
      failed: z.array(z.string()),
    })
    .nullable(),
});

export const setDigestImageOutputSchema = z.strictObject({
  attached: z.array(z.string()),
  ok: z.literal(true),
  stillNeeded: z.array(
    z.strictObject({
      home: z.string(),
      sourceUrl: z.string().nullable().optional(),
    }),
  ),
  unmatched: z.array(z.string()),
  url: z.string(),
});

export const updateEmailDraftOutputSchema = z.strictObject({
  ok: z.literal(true),
  url: z.string(),
});

export const createProductUpdateDraftOutputSchema = z.strictObject({
  contentPostId: z.string(),
  emailDocumentId: z.string(),
  platformPostId: z.string(),
  url: z.string(),
});

export const draftEmailFromTemplateOutputSchema = z.strictObject({
  headerCard: z.boolean(),
  homes: z.array(z.string()),
  next: z.string(),
  ok: z.literal(true),
  platformPostId: z.string(),
  subject: z.string(),
  template: z.enum(newsletterTemplateIds),
  url: z.string(),
});

export const generateEmailDraftOutputSchema = z.strictObject({
  jobId: z.string(),
  status: z.enum(workflowRunStatusEnum.enumValues),
  url: z.string(),
});

export const deleteEmailDraftOutputSchema = z.strictObject({
  action: z.literal("deleted"),
  email: z.strictObject({ id: z.string(), subject: z.string() }),
  ideaDeleted: z.boolean(),
  next: z.string(),
  ok: z.literal(true),
  url: z.string(),
});

/** Native service result; the existing wire contract validates its JSON projection. */
export const getEmailDraftNativeResultSchema = getEmailDraftOutputSchema.extend(
  {
    content: getEmailDraftOutputSchema.shape.content
      .unwrap()
      .extend({ plannedAt: z.date().nullable() })
      .nullable(),
    document: getEmailDraftOutputSchema.shape.document.extend({
      createdAt: z.date(),
      updatedAt: z.date(),
    }),
    latestJob: getEmailDraftOutputSchema.shape.latestJob
      .unwrap()
      .extend({ createdAt: z.date(), completedAt: z.date().nullable() })
      .optional(),
    messageSends: z.array(
      getEmailDraftOutputSchema.shape.messageSends.element.extend({
        approvedAt: z.date().nullable(),
        createdAt: z.date(),
        sentAt: z.date().nullable(),
      }),
    ),
    spot: getEmailDraftOutputSchema.shape.spot.extend({
      publishedAt: z.date().nullable(),
      scheduledAt: z.date().nullable(),
    }),
  },
);
