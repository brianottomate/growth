import "server-only";

import { z } from "zod";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";

import { AD_PLATFORM_VALUES } from "@/lib/ad-platforms";
import {
  audienceActiveWindowSchema,
  audienceContextSchema,
  audienceActivationDemographicModeSchema,
  audienceActivationGeoModeSchema,
  audienceDemographicsSchema,
  audienceEvidenceInputSchema,
  audienceGeographySchema,
  audienceMarketSideSchema,
  audienceProfileScopeSchema,
  audienceResearchMaturitySchema,
  audienceSlug,
  audienceSourceSchema,
} from "@/lib/audience-model";
import { db, withTransaction } from "@/server/db";
import {
  audienceActivationTable,
  audienceActivationStatusEnum,
  audienceEvidenceTable,
  audienceTable,
  audienceTargetPriorityEnum,
  audienceTargetStatusEnum,
  audienceTargetTable,
  brandTable,
} from "@/server/db/schema";
import { growthAction, type CapabilityContext } from "./types";

const targetStatusSchema = z.enum(audienceTargetStatusEnum.enumValues);
const targetPrioritySchema = z.enum(audienceTargetPriorityEnum.enumValues);
const paidPlatformSchema = z.enum(AD_PLATFORM_VALUES);
const activationStatusSchema = z.enum(audienceActivationStatusEnum.enumValues);

const audienceProfileInput = z.object({
  name: z.string().min(1).max(200).describe("Short canonical audience name."),
  description: z
    .string()
    .max(2000)
    .optional()
    .describe("Who they are and why the brand serves them."),
  profileScope: audienceProfileScopeSchema.default("segment"),
  marketSide: audienceMarketSideSchema.default("consumer"),
  researchMaturity: audienceResearchMaturitySchema.default("hypothesis"),
  status: targetStatusSchema.default("planned"),
  priority: targetPrioritySchema.default("should_have"),
  geography: audienceGeographySchema
    .optional()
    .describe(
      "Where the audience IS (origin). Omit when unknown; mode=global means genuinely global.",
    ),
  destinationGeography: audienceGeographySchema
    .optional()
    .describe(
      "For travel intent, where we want to send them (e.g. origin=Pacific NW, destination=California). Omit for non-travel audiences.",
    ),
  demographics: audienceDemographicsSchema
    .optional()
    .describe(
      "Descriptive context for research and messaging, never automatic ad targeting.",
    ),
  context: audienceContextSchema.optional(),
  source: audienceSourceSchema
    .default("manual")
    .describe(
      "Provenance: pixel_event (logged-out retargeting), customer_list (logged-in/first-party upload), amplitude_cohort (behavioural/geo/temporal segment), lookalike_seed, or manual.",
    ),
  sourceRef: z
    .string()
    .max(500)
    .optional()
    .describe(
      "External handle for the source — pixel event name, Amplitude cohort id, or seed audience id.",
    ),
  activeWindow: audienceActiveWindowSchema
    .optional()
    .describe(
      "Seasonal/temporal intent — when this audience is worth reaching (e.g. seasonal May–Aug for summer travel).",
    ),
  intendedChannels: z
    .array(paidPlatformSchema)
    .default([])
    .describe("Paid platforms where an activation should be planned."),
  sizeGoalLabel: z.string().max(100).optional(),
  evidence: z.array(audienceEvidenceInputSchema).max(20).default([]),
});

type PaidPlatform = z.infer<typeof paidPlatformSchema>;
type ProfileInput = z.infer<typeof audienceProfileInput>;
type DbTransaction = Parameters<Parameters<typeof withTransaction>[0]>[0];

async function findOrgBrand(brandId: string, ctx: CapabilityContext) {
  return db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, ctx.orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true },
  });
}

async function syncActivationPlans(
  tx: DbTransaction,
  targetId: string,
  platforms: PaidPlatform[],
) {
  if (platforms.length === 0) {
    await tx
      .delete(audienceActivationTable)
      .where(eq(audienceActivationTable.targetId, targetId));
    return;
  }
  await tx
    .delete(audienceActivationTable)
    .where(
      and(
        eq(audienceActivationTable.targetId, targetId),
        notInArray(audienceActivationTable.platform, platforms),
      ),
    );
  await tx
    .insert(audienceActivationTable)
    .values(
      platforms.map((platform) => ({
        targetId,
        platform,
        geographyMode: "inherit",
        // Profile demographics describe people; campaign targeting must opt in.
        demographicsMode: "none",
      })),
    )
    .onConflictDoNothing();
}

async function upsertProfile(
  tx: DbTransaction,
  brandId: string,
  input: ProfileInput,
) {
  const { evidence, intendedChannels, ...profile } = input;
  const [target] = await tx
    .insert(audienceTargetTable)
    .values({
      ...profile,
      brandId,
      slug: audienceSlug(input.name),
      type: "segment",
      intendedChannels,
    })
    .onConflictDoUpdate({
      target: [audienceTargetTable.brandId, audienceTargetTable.slug],
      set: { ...profile, intendedChannels, deletedAt: null },
    })
    .returning();
  if (!target) throw new Error("Audience profile could not be saved.");
  await syncActivationPlans(tx, target.id, intendedChannels);
  if (evidence.length > 0) {
    await tx
      .delete(audienceEvidenceTable)
      .where(eq(audienceEvidenceTable.targetId, target.id));
    await tx
      .insert(audienceEvidenceTable)
      .values(evidence.map((item) => ({ ...item, targetId: target.id })));
  }
  return target;
}

export const listAudienceTargets = growthAction({
  description:
    "Read the strategic audience/ICP profiles for the organization, optionally for one brand. Returns reusable geography, descriptive demographics, needs and messaging context, research evidence, planned channel activations, linked real platform audiences, and coverage gaps. Use this before audience, messaging, content, or campaign recommendations.",
  inputSchema: z.object({
    brandId: z
      .string()
      .optional()
      .describe("Optional brand id from listBrands. Omit to read every brand."),
  }),
  execute: async (input, ctx) => {
    const brands = await db.query.brandTable.findMany({
      where: and(
        eq(brandTable.organizationId, ctx.orgId),
        isNull(brandTable.deletedAt),
      ),
      columns: { id: true, name: true },
    });
    const selectedBrands = input.brandId
      ? brands.filter((brand) => brand.id === input.brandId)
      : brands;
    if (input.brandId && selectedBrands.length === 0) {
      return {
        error: "That brand isn't in your organization.",
        targets: [],
        unmappedPlatformAudiences: [],
      };
    }
    const brandIds = selectedBrands.map((brand) => brand.id);
    if (brandIds.length === 0) {
      return { targets: [], unmappedPlatformAudiences: [] };
    }

    const [targets, platformAudiences] = await Promise.all([
      db.query.audienceTargetTable.findMany({
        where: and(
          inArray(audienceTargetTable.brandId, brandIds),
          isNull(audienceTargetTable.deletedAt),
        ),
        with: { activations: true, evidence: true },
      }),
      db.query.audienceTable.findMany({
        where: inArray(audienceTable.brandId, brandIds),
        with: {
          channel: { columns: { platform: true, displayName: true } },
        },
      }),
    ]);

    const brandNames = new Map(
      selectedBrands.map((brand) => [brand.id, brand.name]),
    );
    const byTarget = new Map<string, typeof platformAudiences>();
    const unmappedPlatformAudiences: typeof platformAudiences = [];
    for (const audience of platformAudiences) {
      if (!audience.targetId) {
        unmappedPlatformAudiences.push(audience);
        continue;
      }
      const linked = byTarget.get(audience.targetId) ?? [];
      linked.push(audience);
      byTarget.set(audience.targetId, linked);
    }

    return {
      targets: targets.map((target) => {
        const linked = byTarget.get(target.id) ?? [];
        const present = new Set<string>(
          linked.map((audience) => audience.channel?.platform).filter(Boolean),
        );
        const intendedChannels =
          target.activations.length > 0
            ? target.activations.map((activation) => activation.platform)
            : (target.intendedChannels ?? []);
        const missingChannels = intendedChannels.filter(
          (platform) => !present.has(platform),
        );
        const coverage =
          intendedChannels.length === 0
            ? linked.length > 0
              ? "covered"
              : "gap"
            : missingChannels.length === 0
              ? "covered"
              : present.size > 0
                ? "partial"
                : "gap";
        return {
          ...target,
          intendedChannels,
          brandName: brandNames.get(target.brandId) ?? null,
          linkedPlatformAudiences: linked,
          coverage,
          missingChannels,
        };
      }),
      unmappedPlatformAudiences,
    };
  },
});

export const createAudienceTarget = growthAction({
  description:
    "Create or idempotently update one strategic audience/ICP profile after the operator explicitly asks. Intended channels create activation plans but never real ad-platform audiences. Use saveAudienceTargets for two or more profiles.",
  inputSchema: audienceProfileInput.extend({
    brandId: z.string().describe("Brand id from listBrands."),
  }),
  execute: async (input, ctx) => {
    const brand = await findOrgBrand(input.brandId, ctx);
    if (!brand) return { error: "That brand isn't in your organization." };
    const { brandId, ...profile } = input;
    const target = await withTransaction((tx) =>
      upsertProfile(tx, brandId, profile),
    );
    return {
      ok: true as const,
      action: "saved" as const,
      target,
      brandName: brand.name,
      url: "/app/audiences",
    };
  },
});

export const saveAudienceTargets = growthAction({
  description:
    "Create or idempotently update 2-10 audience/ICP profiles for one brand in one transaction after the operator explicitly asks. Prefer this over repeated createAudienceTarget calls. It creates requested activation plans but not real platform audiences.",
  inputSchema: z.object({
    brandId: z.string().describe("Brand id from listBrands."),
    targets: z.array(audienceProfileInput).min(2).max(10),
  }),
  execute: async ({ brandId, targets }, ctx) => {
    const brand = await findOrgBrand(brandId, ctx);
    if (!brand) {
      return { error: "That brand isn't in your organization.", targets: [] };
    }
    const saved = await withTransaction(async (tx) => {
      const rows = [];
      for (const target of targets) {
        rows.push(await upsertProfile(tx, brandId, target));
      }
      return rows;
    });
    return {
      ok: true as const,
      action: "saved" as const,
      count: saved.length,
      targets: saved,
      brandName: brand.name,
      url: "/app/audiences",
    };
  },
});

export const updateAudienceTarget = growthAction({
  description:
    "Update an existing strategic audience/ICP profile after reading it and after the operator explicitly requests the change. Geography and demographics update reusable profile context; intended channels update activation plans. It does not edit synced platform audiences.",
  inputSchema: z.object({
    id: z.string().describe("Audience target id from listAudienceTargets."),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    status: targetStatusSchema.optional(),
    priority: targetPrioritySchema.optional(),
    profileScope: audienceProfileScopeSchema.optional(),
    marketSide: audienceMarketSideSchema.optional(),
    researchMaturity: audienceResearchMaturitySchema.optional(),
    geography: audienceGeographySchema.nullable().optional(),
    destinationGeography: audienceGeographySchema.nullable().optional(),
    demographics: audienceDemographicsSchema.nullable().optional(),
    context: audienceContextSchema.nullable().optional(),
    source: audienceSourceSchema.optional(),
    sourceRef: z.string().max(500).nullable().optional(),
    activeWindow: audienceActiveWindowSchema.nullable().optional(),
    intendedChannels: z.array(paidPlatformSchema).optional(),
    sizeGoalLabel: z.string().max(100).nullable().optional(),
    evidence: z.array(audienceEvidenceInputSchema).max(20).optional(),
  }),
  execute: async (input, ctx) => {
    const { id, name, intendedChannels, evidence, ...changes } = input;
    const existing = await db.query.audienceTargetTable.findFirst({
      where: and(
        eq(audienceTargetTable.id, id),
        isNull(audienceTargetTable.deletedAt),
      ),
    });
    if (!existing || !(await findOrgBrand(existing.brandId, ctx))) {
      return { error: "Audience target not found in your organization." };
    }
    if (
      name === undefined &&
      intendedChannels === undefined &&
      evidence === undefined &&
      Object.keys(changes).length === 0
    ) {
      return { error: "No audience target changes were supplied." };
    }

    const target = await withTransaction(async (tx) => {
      const [updated] = await tx
        .update(audienceTargetTable)
        .set({
          ...changes,
          ...(name !== undefined ? { name, slug: audienceSlug(name) } : {}),
          ...(intendedChannels !== undefined ? { intendedChannels } : {}),
        })
        .where(eq(audienceTargetTable.id, id))
        .returning();
      if (intendedChannels !== undefined) {
        await syncActivationPlans(tx, id, intendedChannels);
      }
      if (evidence !== undefined) {
        await tx
          .delete(audienceEvidenceTable)
          .where(eq(audienceEvidenceTable.targetId, id));
        if (evidence.length > 0) {
          await tx
            .insert(audienceEvidenceTable)
            .values(evidence.map((item) => ({ ...item, targetId: id })));
        }
      }
      return updated;
    });
    return {
      ok: true as const,
      action: "updated" as const,
      target,
      url: "/app/audiences",
    };
  },
});

export const updateAudienceActivation = growthAction({
  description:
    "Update a planned per-platform audience activation after reading it with listAudienceTargets and after the operator explicitly requests the change. Use this for campaign targeting geography, demographics, prompt/structured targeting, compliance category, or run state. Profile demographics are descriptive; only this explicit activation layer represents intended ad targeting.",
  inputSchema: z.object({
    id: z.string().describe("Activation id from listAudienceTargets."),
    status: activationStatusSchema.optional(),
    geographyMode: audienceActivationGeoModeSchema.optional(),
    geography: audienceGeographySchema.nullable().optional(),
    demographicsMode: audienceActivationDemographicModeSchema.optional(),
    demographics: audienceDemographicsSchema.nullable().optional(),
    targetingSpec: z.record(z.string(), z.unknown()).nullable().optional(),
    prompt: z.string().max(5000).nullable().optional(),
    exclusions: z.array(z.string().max(500)).max(100).nullable().optional(),
    specialAdCategory: z.string().max(100).nullable().optional(),
    complianceNotes: z.string().max(3000).nullable().optional(),
    reachEstimateLabel: z.string().max(100).nullable().optional(),
  }),
  execute: async ({ id, ...changes }, ctx) => {
    const activation = await db.query.audienceActivationTable.findFirst({
      where: eq(audienceActivationTable.id, id),
      with: { target: { columns: { brandId: true } } },
    });
    if (
      !activation?.target ||
      !(await findOrgBrand(activation.target.brandId, ctx))
    ) {
      return { error: "Audience activation not found in your organization." };
    }
    const [updated] = await db
      .update(audienceActivationTable)
      .set({
        ...changes,
        ...(changes.geographyMode === "inherit" ? { geography: null } : {}),
        ...(changes.demographicsMode === "none" ? { demographics: null } : {}),
      })
      .where(eq(audienceActivationTable.id, id))
      .returning();
    return {
      ok: true as const,
      action: "updated" as const,
      activation: updated,
      url: "/app/audiences",
    };
  },
});
