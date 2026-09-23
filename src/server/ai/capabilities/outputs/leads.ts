import { z } from "zod";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
export const leadsSummaryOutputSchema = z.strictObject({
  contacts: z.number(),
  currentBatch: z.number().optional(),
  domains: z.number().optional(),
  inBuiltwith: z.number().optional(),
  inHubspot: z.number().optional(),
  inInstantly: z.number().optional(),
  integratedPms: z.number().optional(),
  netNew: z.number(),
  ranked: z.number().optional(),
  sendBatch: z.number().optional(),
  targetEnrollable: z.array(
    z.strictObject({
      cohort: z.string(),
      enrollable: z.number(),
      linked: z.number(),
    }),
  ),
  targetMemberships: z.array(
    z.strictObject({
      cohort: z.string(),
      count: z.number(),
      linked: z.number(),
      objectType: z.string(),
    }),
  ),
  topPms: z.array(
    z.strictObject({ count: z.number(), pms: z.string().nullable() }),
  ),
  untouched: z.number().optional(),
  withPreviewUrl: z.number().optional(),
});

export const leadsSequenceOutputSchema = z.union([
  z.strictObject({
    domain: z.string(),
    found: z.literal(false),
    reason: z.string().optional(),
  }),
  z.strictObject({
    angle: z.string().nullable(),
    companyName: z.string().nullable(),
    domain: z.string(),
    found: z.literal(true),
    model: z.string().nullable(),
    owningRep: z.string().nullable(),
    personalizedOn: z.array(z.string()),
    previewUrl: z.string().nullable(),
    status: z.enum([
      "draft",
      "approved",
      "queued",
      "sent",
      "replied",
      "skipped",
    ]),
    touches: z.array(
      z.strictObject({
        body: z.string(),
        sendOnDay: z.number(),
        subject: z.string().nullable(),
        touch: z.number(),
      }),
    ),
  }),
]);

export const leadsRewriteSequenceOutputSchema = z.strictObject({
  angle: z.string().nullable(),
  changed: z.string(),
  domain: z.string(),
  note: z.string(),
  outreachId: z.string(),
  status: z.literal("draft"),
  touches: z.array(
    z.strictObject({
      body: z.string(),
      sendOnDay: z.number(),
      subject: z.string().nullable(),
      touch: z.number(),
    }),
  ),
});
