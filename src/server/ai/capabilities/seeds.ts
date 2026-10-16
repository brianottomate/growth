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
  fillSeedContacts,
  seedMembers,
} from "@/server/services/seeds/service";
import {
  uploadSeed,
  seedLookalike,
  seedAssetStatus,
  attachSeedAsset,
  shareSeedLookalike,
  readSeedDelivery,
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
// Domain output contracts are shared by the app and MCP. Contacts are stored
// for upload to Wander's Meta account but never returned to a model.
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
  contacts: z
    .object({ identifiable: z.number(), phones: z.number() })
    .optional(),
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
  warning: z.string().nullable(),
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
  forBrandId: z.string().nullable(),
  seedMetadata: metadata.nullable(),
});
const share = z.object({
  snapshotId: z.string(),
  platformAudienceId: z.string(),
  lookalikeName: z.string(),
  metaAudienceId: z.string().nullable(),
  sourceAdAccountId: z.string(),
  adsManagerUrl: z.string(),
  clientBrandId: z.string(),
  clientBrandName: z.string(),
  clientAdAccountId: z.string().nullable(),
  clientAdAccountName: z.string().nullable(),
  status: z.enum(["no_client_account", "not_shared", "shared"]),
  sharedPlatformAudienceId: z.string().nullable(),
  sharedAt: z.string().nullable(),
});
const target = z.discriminatedUnion("type", [
  z.object({ type: z.literal("campaign_audience"), id: z.string().min(1) }),
  z.object({ type: z.literal("persona"), id: z.string().min(1) }),
]);
export const listSeedsAction = growthAction({
  description:
    "List reusable brand seed recipes, independent of campaigns, personas and provider audiences.",
  inputSchema: z.object({ brandId: z.string().min(1) }),
  outputSchema: z.array(seed),
  execute: (i, c) => listSeeds(i, actor(c)),
});
export const readSeedAction = growthAction({
  description:
    "Read a seed recipe, frozen builds, its assets in Wander's Meta account and each lookalike's share state toward the client account. Source and provider counts are separate.",
  inputSchema: z.object({ seedListId: z.string().min(1) }),
  outputSchema: z.object({
    list: seed,
    snapshots: z.array(snapshot),
    assets: z.array(asset),
    shares: z.array(share),
  }),
  execute: (i, c) => readSeedDelivery(i, actor(c)),
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
    "Freeze a saved seed recipe into immutable membership with per-contact evidence, stored contact fields (email, E.164 phone, name, city, state, postal code, country) and source query receipts. Check `warning`: a seed needs at least 1,000 entries with an email or phone to upload. New bookings appear on refresh, never silently change a delivered snapshot. No provider writes or sends.",
  inputSchema: z.object({ seedListId: z.string().min(1) }),
  outputSchema: snapshot,
  execute: (i, c) => compileSeed(i, actor(c)),
});
export const seedMembersAction = growthAction({
  description:
    "Page a frozen seed's SHA-256 email identities and evidence for inspection. Contact fields stay in Growth and go only to Wander's Meta account on upload; none are returned here.",
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
export const fillSeedContactsAction = growthAction({
  description:
    "Fill stored contact fields on a snapshot frozen before Growth kept them, from that snapshot's own sources. Membership never changes. Refused once an upload of the snapshot exists. No provider writes.",
  inputSchema: z.object({ snapshotId: z.string().min(1) }),
  outputSchema: z.object({
    snapshotId: z.string(),
    memberCount: z.number(),
    identifiable: z.number(),
    phones: z.number(),
  }),
  execute: (i, c) => fillSeedContacts(i, actor(c)),
});
export const uploadSeedAction = growthAction({
  description:
    "Step 2 of seed delivery: create a customer list in WANDER's Meta ad account (the Wander brand's pinned destination), whichever brand owns the seed, and upload every member with an email or phone (email + phone; Zernio hashes). Wander's customer data never goes to a client account. Needs at least 1,000 uploadable entries. Explicit approval, no spend. Creation is not idempotent: never auto-retry; to resume, pass the returned platformAudienceId. matchedSize is Meta's figure, information only.",
  inputSchema: z.object({
    snapshotId: z.string().min(1),
    platformAudienceId: z.string().min(1).optional(),
    name: z.string().min(1).max(160).optional(),
    approved: z.literal(true),
  }),
  outputSchema: z.object({
    platformAudienceId: z.string(),
    adAccountId: z.string(),
    uploaded: z.number(),
    entries: z.number(),
    memberCount: z.number(),
    matchedSize: z.number().nullable(),
  }),
  execute: (i, c) => uploadSeed(i, actor(c)),
});
export const seedAssetStatusAction = growthAction({
  description:
    "Read fresh provider processing status and Meta's matched size for an uploaded seed in Wander's account. Matched size is information only; the 1,000 minimum applies to uploaded entries.",
  inputSchema: z.object({
    snapshotId: z.string().min(1),
    platformAudienceId: z.string().min(1),
  }),
  outputSchema: z.object({
    platformAudienceId: z.string(),
    sourceCount: z.number(),
    entries: z.number().nullable(),
    uploadStatus: z.string().nullable(),
    matchedSize: z.number().nullable(),
    provider: record.nullable(),
  }),
  execute: (i, c) => seedAssetStatus(i, actor(c)),
});
export const seedLookalikeAction = growthAction({
  description:
    "Step 3: create a lookalike (default 1% US) from an uploaded seed in Wander's account, recorded as built for the seed's brand. Meta builds it from matched members; surface any Meta error verbatim. Explicit approval, no spend. Never auto-retry. Returns `share`: give the operator the lookalike name and Meta audience ID, the client ad account ID and the Ads Manager link to share it.",
  inputSchema: z.object({
    snapshotId: z.string().min(1),
    seedPlatformAudienceId: z.string().min(1),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .default("US"),
    ratio: z.number().min(0.01).max(0.2).default(0.01),
    approved: z.literal(true),
  }),
  outputSchema: z.object({
    platformAudienceId: z.string(),
    parentPlatformAudienceId: z.string(),
    share,
  }),
  execute: (i, c) => seedLookalike(i, actor(c)),
});
export const shareSeedLookalikeAction = growthAction({
  description:
    "Step 4, after the operator shares the LOOKALIKE (never the seed) with the client account in Ads Manager: check the client account's audiences and, once it appears, record the client's copy and optionally attach it to the client's campaign audience or persona. If Meta does not list it, ask the operator and pass confirmShared only on their word. No provider writes.",
  inputSchema: z.object({
    snapshotId: z.string().min(1),
    platformAudienceId: z.string().min(1),
    confirmShared: z.boolean().optional(),
    target: target.optional(),
  }),
  outputSchema: share.extend({
    detected: z.enum(["provider", "operator", "same_account"]).nullable(),
    attached: z.boolean(),
    next: z.string().nullable(),
  }),
  execute: (i, c) => shareSeedLookalike(i, actor(c)),
});
export const attachSeedAssetAction = growthAction({
  description:
    "Attach this brand's own copy of a delivered lookalike (sharedPlatformAudienceId from share) to its campaign audience or persona. For a client brand, the Wander-side seed and lookalike are not targetable; share first. Local only; no campaign is pushed or launched.",
  inputSchema: z.object({
    snapshotId: z.string().min(1),
    platformAudienceId: z.string().min(1),
    target,
  }),
  outputSchema: z.object({
    platformAudienceId: z.string(),
    attached: z.boolean(),
  }),
  execute: (i, c) => attachSeedAsset(i, actor(c)),
});
