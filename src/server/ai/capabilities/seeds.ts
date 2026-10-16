import "server-only";
import { z } from "zod";
import { growthAction } from "./types";
import {
  SEED_TEMPLATE_IDS,
  SEED_TEMPLATES,
  seedOriginSchema,
  seedSourceSchema,
} from "@/lib/seed-definition";
import {
  listSeeds,
  buildSeed,
  rebuildSeed,
  seedMembers,
} from "@/server/services/seeds/service";
import {
  uploadSeed,
  seedLookalike,
  seedAssetStatus,
  attachSeedAsset,
  shareSeedLookalike,
  readSeedDelivery,
  listSeedDeliveries,
} from "@/server/services/seeds/delivery";

const actor = (ctx: { orgId: string; userId: string; runId: string }) => ({
  organizationId: ctx.orgId,
  userId: ctx.userId,
  runId: ctx.runId,
});
// Domain output contracts are shared by the app and MCP. Contacts are stored
// for upload to the seed owner's Meta account but never returned to a model.
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
  origin: seedOriginSchema,
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
  definition: seedSourceSchema,
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
  seedPlatformAudienceId: z.string().nullable(),
  seedName: z.string().nullable(),
  seedMetaAudienceId: z.string().nullable(),
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
    "List a brand's seed lists and what each was built from, independent of campaigns, personas and provider audiences.",
  inputSchema: z.object({ brandId: z.string().min(1) }),
  outputSchema: z.array(seed),
  execute: (i, c) => listSeeds(i, actor(c)),
});
export const readSeedAction = growthAction({
  description:
    "Read a seed list, its frozen builds, its assets in its owner's Meta account and each lookalike's share state toward the client account. Source and provider counts are separate.",
  inputSchema: z.object({ seedListId: z.string().min(1) }),
  outputSchema: z.object({
    list: seed,
    snapshots: z.array(snapshot),
    assets: z.array(asset),
    shares: z.array(share),
  }),
  execute: (i, c) => readSeedDelivery(i, actor(c)),
});
export const seedDeliveriesAction = growthAction({
  description:
    "List seed lists with their delivery stage: not_built, built (entries with email or phone), uploading/uploaded to the owner's Meta account (Wander's for seeds with Wander data, otherwise the brand's own), lookalike created, shared with the client's ad account (automatic in the brand's own account). Omit brandId for every brand (the needs-sharing queue). Pass campaignAudienceId to learn whether that campaign audience already targets the shared lookalike. DB only, no contacts.",
  inputSchema: z.object({
    brandId: z.string().min(1).optional(),
    campaignAudienceId: z.string().min(1).optional(),
  }),
  outputSchema: z.array(
    z.object({
      seedListId: z.string(),
      seedListName: z.string(),
      builtFrom: z.string(),
      wanderData: z.boolean().nullable(),
      brandId: z.string(),
      brandName: z.string(),
      brandSlug: z.string().nullable(),
      stage: z.enum([
        "not_built",
        "built",
        "uploading",
        "uploaded",
        "lookalike",
        "shared",
      ]),
      snapshot: z
        .object({
          id: z.string(),
          memberCount: z.number(),
          entries: z.number().nullable(),
          warning: z.string().nullable(),
          createdAt: z.string(),
        })
        .nullable(),
      seed: z
        .object({
          platformAudienceId: z.string(),
          name: z.string(),
          metaAudienceId: z.string().nullable(),
          status: z.string().nullable(),
          uploaded: z.number().nullable(),
          entries: z.number().nullable(),
        })
        .nullable(),
      lookalike: z
        .object({
          platformAudienceId: z.string(),
          name: z.string(),
          metaAudienceId: z.string().nullable(),
          sizeLabel: z.string().nullable(),
        })
        .nullable(),
      share: share.nullable(),
      linkedToCampaignAudience: z.boolean(),
    }),
  ),
  execute: (i, c) => listSeedDeliveries(i, actor(c)),
});
export const buildSeedAction = growthAction({
  description: `Make a seed list from a starting point and build it now: ${SEED_TEMPLATES.map((t) => `${t.id} (${t.summary})`).join("; ")} persona needs personaId, described needs steer, email_list needs emailListId. Check \`warning\`: below about 1,000 entries Meta's lookalikes are weak. No provider writes.`,
  inputSchema: z.object({
    brandId: z.string().min(1),
    template: z.enum(SEED_TEMPLATE_IDS),
    personaId: z.string().min(1).optional(),
    steer: z.string().trim().min(1).max(2000).optional(),
    emailListId: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(160).optional(),
  }),
  outputSchema: z.object({ list: seed, snapshot }),
  execute: (i, c) => buildSeed(i, actor(c)),
});
export const rebuildSeedAction = growthAction({
  description:
    "Build a seed list again into a new frozen build. Fixed templates run on today's homes and data, persona and described lists reuse their last filters, an email list copy copies again. Earlier builds and anything already on Meta are unchanged. No provider writes.",
  inputSchema: z.object({ seedListId: z.string().min(1) }),
  outputSchema: snapshot,
  execute: (i, c) => rebuildSeed(i, actor(c)),
});
export const seedMembersAction = growthAction({
  description:
    "Page a frozen seed's SHA-256 email identities and evidence for inspection. Contact fields stay in Growth and go only to the seed owner's Meta account on upload; none are returned here.",
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
export const uploadSeedAction = growthAction({
  description:
    "Create a Meta customer list from a seed build and upload every member with an email or phone (Zernio hashes). A seed with Wander data goes to WANDER's ad account and its lookalike is shared with the client; any other seed goes to the brand's own pinned account. Check `warning`: below about 1,000 entries Meta's lookalikes are weak, but the upload is not refused. Explicit approval, no spend. Creation is not idempotent: never auto-retry; to resume, pass the returned platformAudienceId. matchedSize is Meta's figure, information only.",
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
    warning: z.string().nullable(),
  }),
  execute: (i, c) => uploadSeed(i, actor(c)),
});
export const seedAssetStatusAction = growthAction({
  description:
    "Read fresh provider processing status and Meta's matched size for an uploaded seed in its owner's account. Matched size is information only.",
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
    "Create a lookalike (default 1% US) from an uploaded seed in the same account, recorded as built for the seed's brand. Meta builds it from matched members; surface any Meta error verbatim. Explicit approval, no spend. Never auto-retry. Returns `share`: when status is not_shared (Wander's account), give the operator the lookalike name and Meta audience ID, the client ad account ID and the Ads Manager link to share it. In the brand's own account it is already shared.",
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
    "For a lookalike in Wander's account, after the operator shares the LOOKALIKE (never the seed) with the client account in Ads Manager: check the client account's audiences and, once it appears, record the client's copy and optionally attach it to the client's campaign audience or persona. If Meta does not list it, ask the operator and pass confirmShared only on their word. No provider writes.",
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
    "Attach this brand's own copy of a delivered lookalike (sharedPlatformAudienceId from share) to its campaign audience or persona. A Wander-side seed or lookalike is not targetable for a client brand; share first. Assets in the brand's own account attach directly. Local only; no campaign is pushed or launched.",
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
