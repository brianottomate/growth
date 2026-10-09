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
  compileEmailAudience,
  getEmailAudienceSnapshot,
} from "@/server/services/email-audience.service";

const audience = z.object({
  id: z.string(),
  brandId: z.string(),
  name: z.string(),
  definition: emailAudienceDefinitionSchema,
  revision: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  latestSnapshotId: z.string().nullable(),
  latestSnapshot: z
    .object({
      status: z.enum(["compiling", "ready", "failed"]),
      recipientCount: z.number().nullable(),
      expiresAt: z.string(),
      revision: z.number(),
    })
    .nullable(),
});
const snapshot = z.object({
  id: z.string(),
  audienceId: z.string(),
  revision: z.number(),
  definition: emailAudienceDefinitionSchema,
  querySql: z.string(),
  queryHash: z.string(),
  jobId: z.string(),
  tableId: z.string(),
  status: z.enum(["compiling", "ready", "failed"]),
  recipientCount: z.number().nullable(),
  error: z.string().nullable(),
  expiresAt: z.string(),
  createdAt: z.string(),
  blockers: z.array(z.string()),
});
const actor = (ctx: { orgId: string; userId: string }) => ({
  organizationId: ctx.orgId,
  userId: ctx.userId,
});
export const listEmailAudiencesAction = growthAction({
  description:
    "Read saved warehouse email audiences for a brand. These are guest recipient rules, separate from sales leads and advertising personas.",
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
    source: z.enum(["wander_cio", "wanderos"]),
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
export const compileEmailAudienceAction = growthAction({
  description:
    "Compile a saved audience revision into a private, immutable BigQuery recipient table expiring after 30 days. Returns an asynchronous job receipt; poll audienceSnapshot for readiness. No guest records are copied into Neon and no email is sent. Live opt-outs and suppressions must still be checked before each delivery batch.",
  inputSchema: z.object({
    audienceId: z.string(),
  }),
  outputSchema: snapshot,
  execute: (input, ctx) => compileEmailAudience(input, actor(ctx)),
});
export const emailAudienceSnapshotAction = growthAction({
  description:
    "Read compilation status and recipient count for an owned audience snapshot. A ready snapshot is candidate membership, not send authorization.",
  inputSchema: z.object({ snapshotId: z.string() }),
  outputSchema: snapshot,
  execute: (input, ctx) => getEmailAudienceSnapshot(input, actor(ctx)),
});
