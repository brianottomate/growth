import "server-only";
import { z } from "zod";
import { growthAction } from "./types";
import {
  SEED_TEMPLATE_IDS,
  SEED_TEMPLATES,
  seedDefinitionSchema,
  seedOriginSchema,
} from "@/lib/seed-definition";
import {
  buildSeed,
  listSeeds,
  refreshSeed,
} from "@/server/services/seeds/service";
import {
  attachSeedAsset,
  listSeedDeliveries,
  seedAssetStatus,
  seedLookalike,
  shareSeedLookalike,
  uploadSeed,
} from "@/server/services/seeds/delivery";

const actor = (ctx: { orgId: string; userId: string; runId: string }) => ({
  organizationId: ctx.orgId,
  userId: ctx.userId,
  runId: ctx.runId,
});
// Contacts are stored for upload to the list owner's Meta account and are
// never returned to a model.
const seed = z.object({
  id: z.string(),
  brandId: z.string(),
  name: z.string(),
  origin: seedOriginSchema,
  definition: seedDefinitionSchema.nullable(),
  memberCount: z.number(),
  summary: z.object({
    candidates: z.number(),
    evidence: z.object({
      bookers: z.number(),
      checkouts: z.number(),
      dates: z.number(),
      views: z.number(),
    }),
    identifiable: z.number(),
    phones: z.number(),
  }),
  builtFrom: z.string(),
  warning: z.string().nullable(),
  builtAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const share = z.object({
  seedListId: z.string(),
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
    "List a brand's seed lists, what built each one and how many people it holds. No contacts.",
  inputSchema: z.object({ brandId: z.string().min(1) }),
  outputSchema: z.array(seed),
  execute: (i, c) => listSeeds(i, actor(c)),
});
export const seedDeliveriesAction = growthAction({
  description:
    "List seed lists with their Meta stage: built, uploaded (to Wander's account for Wander traveler lists, otherwise the brand's own), failed, lookalike created, shared with the client's ad account (automatic in the brand's own account). Omit brandId for every brand (the needs-sharing queue). Pass campaignAudienceId to learn whether that campaign audience already targets the shared lookalike. DB only, no contacts.",
  inputSchema: z.object({
    brandId: z.string().min(1).optional(),
    campaignAudienceId: z.string().min(1).optional(),
  }),
  outputSchema: z.array(
    seed.extend({
      brandName: z.string(),
      brandSlug: z.string().nullable(),
      wanderData: z.boolean(),
      stage: z.enum(["built", "uploaded", "failed", "lookalike", "shared"]),
      seed: z
        .object({
          platformAudienceId: z.string(),
          name: z.string(),
          metaAudienceId: z.string().nullable(),
          status: z.string().nullable(),
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
  description: `Make a seed list from a starting point and build it now: ${SEED_TEMPLATES.map((t) => `${t.id} (${t.summary})`).join("; ")} persona needs personaId, described needs steer, email_list needs emailListId. Check \`warning\`: below about 1,000 people Meta's lookalikes are weak. No provider writes.`,
  inputSchema: z.object({
    brandId: z.string().min(1),
    template: z.enum(SEED_TEMPLATE_IDS),
    personaId: z.string().min(1).optional(),
    steer: z.string().trim().min(1).max(2000).optional(),
    emailListId: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(160).optional(),
  }),
  outputSchema: seed,
  execute: (i, c) => buildSeed(i, actor(c)),
});
export const refreshSeedAction = growthAction({
  description:
    "Build a seed list again in place: templates run on today's homes and data, persona and described lists reuse their filters, an email list is copied again. Anything already uploaded to Meta is unchanged. No provider writes.",
  inputSchema: z.object({ seedListId: z.string().min(1) }),
  outputSchema: seed,
  execute: (i, c) => refreshSeed(i, actor(c)),
});
export const uploadSeedAction = growthAction({
  description:
    "Create a Meta customer list from a seed list and upload everyone with an email or phone (Zernio hashes). Wander traveler lists go to WANDER's ad account and their lookalike is shared with the client; the brand's own guests go to the brand's own pinned account. One pass: on failure, upload again (a new Meta list). Explicit approval, no spend.",
  inputSchema: z.object({
    seedListId: z.string().min(1),
    name: z.string().min(1).max(160).optional(),
    approved: z.literal(true),
  }),
  outputSchema: z.object({
    platformAudienceId: z.string(),
    adAccountId: z.string(),
    uploaded: z.number(),
    warning: z.string().nullable(),
  }),
  execute: (i, c) => uploadSeed(i, actor(c)),
});
export const seedAssetStatusAction = growthAction({
  description:
    "Read Meta's processing status and matched size for an uploaded seed list. Matched size is information only.",
  inputSchema: z.object({
    seedListId: z.string().min(1),
    platformAudienceId: z.string().min(1),
  }),
  outputSchema: z.object({
    platformAudienceId: z.string(),
    uploadStatus: z.string().nullable(),
    providerStatus: z.string().nullable(),
    matchedSize: z.number().nullable(),
  }),
  execute: (i, c) => seedAssetStatus(i, actor(c)),
});
export const seedLookalikeAction = growthAction({
  description:
    "Create a lookalike (default 1% US) from an uploaded seed list in the same account, recorded as built for the list's brand. Surface any Meta error verbatim. Explicit approval, no spend. Returns `share`: when status is not_shared (Wander's account), give the operator the lookalike name, its Meta audience ID, the client ad account ID and the Ads Manager link to share it.",
  inputSchema: z.object({
    seedListId: z.string().min(1),
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
    seedListId: z.string().min(1),
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
    seedListId: z.string().min(1),
    platformAudienceId: z.string().min(1),
    target,
  }),
  outputSchema: z.object({
    platformAudienceId: z.string(),
    attached: z.boolean(),
  }),
  execute: (i, c) => attachSeedAsset(i, actor(c)),
});
