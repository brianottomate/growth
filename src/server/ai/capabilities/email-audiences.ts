import "server-only";
import { z } from "zod";
import { growthAction } from "./types";
import {
  emailAudienceDefinitionSchema,
  emailAudienceRecipientSchema,
} from "@/lib/email-audience";
import {
  listEmailAudiences,
  saveEmailAudience,
  previewEmailAudience,
  addEmailAudienceMembers,
  importEmailList,
} from "@/server/services/email-audience.service";

const audience = z.object({
  id: z.string(),
  brandId: z.string(),
  name: z.string(),
  definition: emailAudienceDefinitionSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  recipientCount: z.number().nullable(),
});
const actor = (ctx: { orgId: string; userId: string }) => ({
  organizationId: ctx.orgId,
  userId: ctx.userId,
});
export const listEmailAudiencesAction = growthAction({
  description:
    "Read saved database-list and warehouse email audiences for a brand. These are guest recipient rules, separate from sales leads and advertising personas.",
  inputSchema: z.object({ brandId: z.string() }),
  outputSchema: z.array(audience),
  execute: (input, ctx) => listEmailAudiences(input, actor(ctx)),
});
export const previewEmailAudienceAction = growthAction({
  description:
    "Preview warehouse email audience counts, generated SQL and sending blockers without recipient PII; the UI separately shows ten sample recipients. Tune typed query parameters; never infer consent from a booking or send an email. SQL/brand scoping is owned by code. Recent clicks exclude known machine and prefetched activity.",
  inputSchema: z.object({
    brandId: z.string(),
    definition: emailAudienceDefinitionSchema,
  }),
  outputSchema: z.object({
    candidateCount: z.number(),
    sample: z.array(emailAudienceRecipientSchema),
    querySql: z.string(),
    estimatedBytes: z.string().nullable(),
    blockers: z.array(z.string()),
    source: emailAudienceDefinitionSchema.shape.source,
    checkedAt: z.string(),
    sourceLoadedThrough: z.string().nullable(),
  }),
  execute: async (input, ctx) => {
    const preview = await previewEmailAudience(input, actor(ctx));
    // Tool results are retained in chat and execution receipts. Keep guest PII out.
    return { ...preview, sample: [] as typeof preview.sample };
  },
});
export const saveEmailAudienceAction = growthAction({
  description:
    "Save or revise a brand's reusable warehouse email audience rules. consentConfirmed may only be true when the operator explicitly confirmed marketing permission. Saving does not authorize sending.",
  inputSchema: z.object({
    brandId: z.string(),
    id: z.string().optional(),
    name: z.string().trim().min(1).max(160),
    definition: emailAudienceDefinitionSchema,
  }),
  outputSchema: audience,
  execute: (input, ctx) => saveEmailAudience(input, actor(ctx)),
});
export const addEmailAudienceMembersAction = growthAction({
  description:
    "Add consent-confirmed contacts to an existing brand database audience. Scheduled sends read current membership through normal paging; there is no frozen recipient set. Never sends an email or replaces the audience.",
  inputSchema: z.object({
    audienceId: z.string().min(1),
    consentConfirmed: z.literal(true),
    rows: z
      .array(
        z.object({
          email: z.string().max(320),
          firstName: z.string().max(200).nullable(),
          sourceId: z.string().max(200).nullable(),
        }),
      )
      .min(1)
      .max(200_000),
  }),
  outputSchema: z.object({
    imported: z.number(),
    invalid: z.number(),
    duplicates: z.number(),
    namesCleared: z.number(),
  }),
  execute: (input, ctx) => addEmailAudienceMembers(input, actor(ctx)),
});

export const importEmailListAction = growthAction({
  description:
    "Import an operator-supplied, consent-confirmed contact list as a reusable database audience for this brand. Use addAudienceMembers when appending to an existing audience. Rows must already be parsed from the source file. The action returns aggregate import counts, never recipient rows, and does not authorize or send email.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    name: z.string().trim().min(1).max(160),
    fileName: z.string().max(300).nullable(),
    consentConfirmed: z.literal(true),
    rows: z
      .array(
        z.object({
          email: z.string().max(320),
          firstName: z.string().max(200).nullable(),
          sourceId: z.string().max(200).nullable(),
        }),
      )
      .min(1)
      .max(200_000),
  }),
  outputSchema: z.strictObject({
    audience,
    imported: z.number(),
    invalid: z.number(),
    duplicates: z.number(),
    namesCleared: z.number(),
  }),
  examples: [
    {
      brandId: "brand_example",
      name: "October guest list",
      fileName: "guests.csv",
      consentConfirmed: true,
      rows: [
        {
          email: "guest@example.com",
          firstName: "Guest",
          sourceId: "row-1",
        },
      ],
    },
  ],
  execute: (input, ctx) => importEmailList(input, actor(ctx)),
});
