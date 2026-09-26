import { emailGenerationStatusEnum } from "@/server/db/email-document-schema";
import { messageSendStatusEnum } from "@/server/db/email-document-schema";
import { contentStatusEnum } from "@/server/db/content-schema";
import { z } from "zod";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
const propertyItemSchema = z.strictObject({
  city: z.string().nullable().optional(),
  href: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  name: z.string(),
  nightlyUsd: z.number().nullable().optional(),
  operated: z.boolean(),
  perPersonUsd: z.number().nullable().optional(),
  sleeps: z.number().nullable().optional(),
});

const sectionItemSchema = z.strictObject({
  heading: z.string(),
  properties: z.array(propertyItemSchema),
});

const digestSchema = z.strictObject({
  rationale: z.string().nullable().optional(),
  schema: z.literal("wander-growth.listings-digest.v1"),
  sections: z.array(sectionItemSchema),
  theme: z.string().nullable().optional(),
});

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
  }),
  canDeliver: z.boolean(),
  content: z
    .strictObject({
      campaign: z.strictObject({ id: z.string(), name: z.string() }).nullable(),
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
    currentRevision: z.number(),
    digest: digestSchema.nullable(),
    handoffTargetRepo: z.string().nullable(),
    id: z.string(),
    platformPostId: z.string(),
    preheader: z.string().nullable(),
    productUpdate: productUpdateSchema.nullable(),
    subject: z.string(),
    templateKey: z.string(),
    updatedAt: z.iso.datetime(),
  }),
  latestJob: z
    .strictObject({
      brief: z.string().nullable(),
      completedAt: z.iso.datetime().nullable(),
      createdAt: z.iso.datetime(),
      createdBy: z.string().nullable(),
      emailDocumentId: z.string(),
      error: z.string().nullable(),
      id: z.string(),
      model: z.string(),
      platformPostId: z.string(),
      startedAt: z.iso.datetime().nullable(),
      status: z.enum(emailGenerationStatusEnum.enumValues),
      updatedAt: z.iso.datetime(),
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
      provider: z.literal("customerio"),
      providerBroadcastId: z.string(),
      providerMessageId: z.string().nullable(),
      revision: z.number(),
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
  versions: z.array(
    z.strictObject({
      createdAt: z.iso.datetime(),
      createdBy: z.string().nullable(),
      emailDocumentId: z.string(),
      id: z.string(),
      note: z.string().nullable(),
      revision: z.number(),
      snapshot: z.strictObject({
        bodyMarkdown: z.string(),
        ctaLabel: z.string().nullable(),
        ctaUrl: z.string().nullable(),
        digest: digestSchema.nullable().optional(),
        handoffTargetRepo: z.string().nullable(),
        preheader: z.string().nullable(),
        productUpdate: productUpdateSchema.nullable().optional(),
        subject: z.string(),
        templateKey: z.string(),
      }),
      source: z.enum(["manual", "generation", "restore"]),
    }),
  ),
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
  revision: z.number(),
  url: z.string(),
});

export const createProductUpdateDraftOutputSchema = z.strictObject({
  contentPostId: z.string(),
  emailDocumentId: z.string(),
  platformPostId: z.string(),
  revision: z.number(),
  url: z.string(),
});

export const generateEmailDraftOutputSchema = z.strictObject({
  jobId: z.string(),
  status: z.enum(emailGenerationStatusEnum.enumValues),
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
