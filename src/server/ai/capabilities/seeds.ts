import "server-only";
import { z } from "zod";
import { growthAction } from "./types";
import { seedDefinitionSchema } from "@/lib/seed-definition";
import {
  listSeeds,
  readSeed,
  saveSeed,
  previewSeed,
  compileSeed,
  seedMembers,
} from "@/server/services/seeds/service";
import {
  uploadSeed,
  seedLookalike,
  seedAssetStatus,
  attachSeedAsset,
} from "@/server/services/seeds/delivery";
import {
  seedPropertyOptions,
  suggestSeeds,
} from "@/server/services/seeds/suggestions";

const actor = (ctx: { orgId: string; userId: string; runId: string }) => ({
  organizationId: ctx.orgId,
  userId: ctx.userId,
  runId: ctx.runId,
});
// Domain output contracts are shared by the app and MCP. No plaintext recipients.
const record = z.record(z.string(), z.json());
const evidence = z.object({
  source: z.string(),
  search: z.string().nullable(),
  score: z.number(),
  ring: z.number(),
  bookings: z.number(),
  views: z.number(),
  dates: z.number(),
  checkouts: z.number(),
});
const seed = z.object({
  id: z.string(),
  brandId: z.string(),
  name: z.string(),
  definition: seedDefinitionSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
const source = z.object({
  name: z.string(),
  rows: z.number(),
  jobId: z.string().nullable(),
  bytesProcessed: z.string().nullable(),
});
const diagnostics = z.object({
  expansion: z.array(z.object({ ring: z.number(), count: z.number() })),
  goalMet: z.boolean().nullable(),
  candidateCount: z.number(),
  excludedCount: z.number(),
  sources: z.array(source),
  queries: z.array(z.object({ sql: z.string(), params: record })),
});
const snapshot = z.object({
  id: z.string(),
  seedListId: z.string(),
  definition: seedDefinitionSchema,
  asOf: z.string(),
  memberCount: z.number(),
  diagnostics,
  createdAt: z.string(),
  downloadUrl: z.string(),
});
const metadata = z.object({
  source: z.enum(["csv", "bigquery", "seed"]),
  snapshotId: z.string().optional(),
  count: z.number(),
  uploadedCount: z.number().optional(),
  status: z.enum(["uploading", "ready", "failed"]),
  cleanupFailed: z.boolean().optional(),
});
const asset = z.object({
  adAccountId: z.string().nullable(),
  id: z.string(),
  name: z.string(),
  seedSnapshotId: z.string().nullable(),
  parentPlatformAudienceId: z.string().nullable(),
  externalId: z.string().nullable(),
  seedMetadata: metadata.nullable(),
});
export const listSeedsAction = growthAction({
  description:
    "List reusable brand seed recipes, independent of campaigns, personas and provider audiences.",
  inputSchema: z.object({ brandId: z.string().min(1) }),
  outputSchema: z.array(seed),
  execute: (i, c) => listSeeds(i, actor(c)),
});
export const readSeedAction = growthAction({
  description:
    "Read a seed recipe, frozen builds and attached platform assets. Source and provider counts are separate.",
  inputSchema: z.object({ seedListId: z.string().min(1) }),
  outputSchema: z.object({
    list: seed,
    snapshots: z.array(snapshot),
    assets: z.array(asset),
  }),
  execute: (i, c) => readSeed(i, actor(c)),
});
export const previewSeedAction = growthAction({
  description:
    "Run typed source queries and preview deduplicated seed counts/evidence, no DB writes or contacts returned. Geography refers to travel destinations. No minimum size; optional targetCount only stops bounded radius expansion. Single views score 25, repeat views 45, dates 65, checkout 80, bookers/uploads 100. Scores are heuristics, not probabilities.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    definition: seedDefinitionSchema,
  }),
  outputSchema: diagnostics.extend({
    asOf: z.string(),
    definition: seedDefinitionSchema,
    memberCount: z.number(),
    evidenceCounts: z.record(z.string(), z.number()),
  }),
  execute: (i, c) => previewSeed(i, actor(c)),
});
export const saveSeedAction = growthAction({
  description:
    "Save or edit a reusable seed recipe. Unions selected uploads, own bookers and Wander searches; negative searches/manual hash exclusions subtract contacts. Edits are last-write-wins and never change previous snapshots or provider membership.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    id: z.string().optional(),
    name: z.string().trim().min(1).max(160),
    definition: seedDefinitionSchema,
  }),
  outputSchema: seed,
  execute: (i, c) => saveSeed(i, actor(c)),
});
export const compileSeedAction = growthAction({
  description:
    "Freeze a saved seed recipe into immutable hashed membership with per-contact evidence and source query receipts. New bookings appear on refresh, never silently change a delivered snapshot. No provider writes or sends.",
  inputSchema: z.object({ seedListId: z.string().min(1) }),
  outputSchema: snapshot,
  execute: (i, c) => compileSeed(i, actor(c)),
});
export const seedMembersAction = growthAction({
  description:
    "Page a frozen seed's SHA-256 email identities and evidence for export or inspection. These are prehashed identities, not inputs to Zernio's plaintext email API. No raw emails returned.",
  inputSchema: z.object({
    snapshotId: z.string().min(1),
    afterHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    limit: z.number().int().min(1).max(10000).optional(),
  }),
  outputSchema: z.object({
    members: z.array(
      z.object({
        emailHash: z.string(),
        score: z.number(),
        evidence: z.array(evidence),
      }),
    ),
    nextAfterHash: z.string().nullable(),
  }),
  execute: (i, c) => seedMembers(i, actor(c)),
});
export const seedPropertyOptionsAction = growthAction({
  description:
    "Find observed property geographies and landscapes for a literal keyword, to ground seed-search proposals. Returns up to 100 inventory groups, never customer data. This is a catalog limit, not a seed size limit.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    term: z.string().trim().min(1).max(160),
  }),
  outputSchema: z.object({
    jobId: z.string().nullable(),
    options: z.array(
      z.object({
        state: z.string().nullable(),
        city: z.string().nullable(),
        landscape: z.string().nullable(),
        properties: z.number(),
        latitude: z.number().nullable(),
        longitude: z.number().nullable(),
      }),
    ),
  }),
  execute: (i, c) => seedPropertyOptions(i, actor(c)),
});
export const suggestSeedsAction = growthAction({
  description:
    "Propose typed, evidence-based seed hypotheses from the brand story, personas and inventory. Go beyond geography using property descriptions/activities, lake/forest interests, pets, group capacity or bedrooms. Proposals are untested hypotheses; preview counts before saving. No SQL generated, no contacts shown, no provider writes.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    steer: z.string().max(4000).optional(),
  }),
  outputSchema: z.array(
    z.object({
      name: z.string(),
      why: z.string(),
      definition: seedDefinitionSchema,
    }),
  ),
  execute: (i, c) => suggestSeeds(i, actor(c)),
});
export const uploadSeedAction = growthAction({
  description:
    "Create and populate a customer-list audience from a reviewed seed snapshot in the brand's allowlisted Meta destination. Explicit approval, no spend. Plaintext is resolved transiently and Zernio hashes once; hashed exports are never double-hashed. Creation is not idempotent: never auto-retry. To resume, reuse returned platformAudienceId. No 1,000-person gate.",
  inputSchema: z.object({
    snapshotId: z.string().min(1),
    adAccountId: z.string().min(1).optional(),
    platformAudienceId: z.string().min(1).optional(),
    name: z.string().min(1).max(160).optional(),
    approved: z.literal(true),
  }),
  outputSchema: z.object({
    platformAudienceId: z.string(),
    uploaded: z.number(),
    total: z.number(),
  }),
  execute: (i, c) => uploadSeed(i, actor(c)),
});
export const seedAssetStatusAction = growthAction({
  description:
    "Read fresh provider matching/processing status for an uploaded snapshot asset. Source membership and upload completion do not imply Meta match count or lookalike eligibility.",
  inputSchema: z.object({
    snapshotId: z.string().min(1),
    platformAudienceId: z.string().min(1),
  }),
  outputSchema: z.object({
    platformAudienceId: z.string(),
    sourceCount: z.number(),
    uploadStatus: z.string().nullable(),
    provider: record.nullable(),
  }),
  execute: (i, c) => seedAssetStatus(i, actor(c)),
});
export const seedLookalikeAction = growthAction({
  description:
    "Create a lookalike from an uploaded seed asset in that same allowlisted Meta account. Explicit approval, no spend. Meta owns matching/eligibility; we impose no arbitrary source size. Never auto-retry a failed creation; inspect provider state first.",
  inputSchema: z.object({
    snapshotId: z.string().min(1),
    seedPlatformAudienceId: z.string().min(1),
    country: z.string().regex(/^[A-Z]{2}$/),
    ratio: z.number().min(0.01).max(0.2).default(0.01),
    approved: z.literal(true),
  }),
  outputSchema: z.object({
    platformAudienceId: z.string(),
    parentPlatformAudienceId: z.string(),
  }),
  execute: (i, c) => seedLookalike(i, actor(c)),
});
export const attachSeedAssetAction = growthAction({
  description:
    "Attach a ready seed or its lookalike to this brand's campaign audience or persona using existing targeting relationships. Local only; no campaign is pushed or launched.",
  inputSchema: z.object({
    snapshotId: z.string().min(1),
    platformAudienceId: z.string().min(1),
    target: z.discriminatedUnion("type", [
      z.object({ type: z.literal("campaign_audience"), id: z.string().min(1) }),
      z.object({ type: z.literal("persona"), id: z.string().min(1) }),
    ]),
  }),
  outputSchema: z.object({
    platformAudienceId: z.string(),
    attached: z.boolean(),
  }),
  execute: (i, c) => attachSeedAsset(i, actor(c)),
});
