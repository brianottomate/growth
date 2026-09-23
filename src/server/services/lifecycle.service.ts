import "server-only";

import { ORPCError } from "@orpc/server";
import {
  resolveWorkspaceOrganizationId,
  WorkspaceAccessError,
} from "@/server/workspace-actor";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  max,
  or,
} from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import {
  brandTable,
  cleanupStatusEnum,
  lifecycleCampaignTable,
  lifecycleKindEnum,
  lifecycleProgramPriorityEnum,
  lifecycleProgramStatusEnum,
  lifecycleProgramStepTable,
  lifecycleProgramTable,
  lifecycleRunStateEnum,
  lifecycleStepStatusEnum,
  lifecycleStepSystemEnum,
  lifecycleWorkspaceEnum,
  touchpointChannelEnum,
  type LifecycleStepStatus,
} from "@/server/db/schema";

export type LifecycleCoverage = "covered" | "partial" | "gap";

export const lifecycleKindSchema = z.enum(lifecycleKindEnum.enumValues);
export const lifecycleProgramStatusSchema = z.enum(
  lifecycleProgramStatusEnum.enumValues,
);
export const lifecycleProgramPrioritySchema = z.enum(
  lifecycleProgramPriorityEnum.enumValues,
);
export const lifecycleWorkspaceSchema = z.enum(
  lifecycleWorkspaceEnum.enumValues,
);
export const lifecycleChannelSchema = z.enum(touchpointChannelEnum.enumValues);
export const lifecycleStepStatusSchema = z.enum(
  lifecycleStepStatusEnum.enumValues,
);
export const lifecycleStepSystemSchema = z.enum(
  lifecycleStepSystemEnum.enumValues,
);
export const lifecycleRunStateSchema = z.enum(lifecycleRunStateEnum.enumValues);
export const lifecycleCleanupStatusSchema = z.enum(
  cleanupStatusEnum.enumValues,
);

export const lifecycleProgramCreateSchema = z.object({
  brandId: z.string(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).optional(),
  kind: lifecycleKindSchema.optional(),
  status: lifecycleProgramStatusSchema.optional(),
  priority: lifecycleProgramPrioritySchema.optional(),
  workspace: lifecycleWorkspaceSchema.optional(),
  intendedTrigger: z.string().trim().max(200).nullish(),
  intendedChannels: z.array(lifecycleChannelSchema).optional(),
  targetTouchpoints: z.number().int().min(0).max(50).nullish(),
});

export const lifecycleProgramChangesSchema = lifecycleProgramCreateSchema
  .omit({ brandId: true })
  .partial();

const lifecycleStepFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  channel: lifecycleChannelSchema.optional(),
  status: lifecycleStepStatusSchema.optional(),
  system: lifecycleStepSystemSchema.nullish(),
  position: z.number().int().min(0).optional(),
  delayMinutes: z.number().int().min(0).max(525_600).nullish(),
  delayLabel: z.string().trim().max(100).nullish(),
  subject: z.string().trim().max(500).nullish(),
  body: z.string().trim().max(20_000).nullish(),
  url: z.string().trim().max(2_000).nullish(),
  campaignId: z.string().nullish(),
  parentStepId: z.string().nullish(),
  branchLabel: z.string().trim().max(200).nullish(),
});

export const lifecycleStepCreateSchema = lifecycleStepFieldsSchema.extend({
  programId: z.string(),
});

export const lifecycleStepChangesSchema = lifecycleStepFieldsSchema.partial();

export const lifecycleCampaignSearchSchema = z.object({
  brandId: z.string().optional(),
  query: z.string().trim().max(200).optional(),
  runStates: z.array(lifecycleRunStateSchema).max(7).optional(),
  cleanupStatuses: z.array(lifecycleCleanupStatusSchema).max(5).optional(),
  unlinkedOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(30),
});

export function lifecycleCoverageOf(
  steps: { status: LifecycleStepStatus }[],
  target: number | null,
): LifecycleCoverage {
  if (steps.length === 0 || steps.every((step) => step.status === "missing")) {
    return "gap";
  }
  const allActive = steps.every((step) => step.status === "active");
  const targetMet = target == null || steps.length >= target;
  return allActive && targetMet ? "covered" : "partial";
}

export async function resolveLifecycleOrganizationId(input: {
  userId: string;
  preferredOrganizationId?: string | null;
}) {
  try {
    return await resolveWorkspaceOrganizationId(input);
  } catch (error) {
    if (error instanceof WorkspaceAccessError)
      throw new ORPCError("FORBIDDEN", { message: error.message });
    throw error;
  }
}

async function organizationBrandIds(organizationId: string) {
  const brands = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, organizationId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true },
  });
  return brands.map((brand) => brand.id);
}

async function assertBrandAccess(organizationId: string, brandId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, organizationId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true },
  });
  if (!brand) {
    throw new ORPCError("NOT_FOUND", { message: "Brand not found" });
  }
  return brand;
}

async function assertProgramAccess(
  organizationId: string,
  programId: string,
  includeArchived = false,
) {
  const program = await db.query.lifecycleProgramTable.findFirst({
    where: and(
      eq(lifecycleProgramTable.id, programId),
      ...(includeArchived ? [] : [isNull(lifecycleProgramTable.deletedAt)]),
    ),
  });
  if (!program) {
    throw new ORPCError("NOT_FOUND", { message: "Program not found" });
  }
  await assertBrandAccess(organizationId, program.brandId);
  return program;
}

async function assertCampaignAccess(
  organizationId: string,
  campaignId: string,
) {
  const campaign = await db.query.lifecycleCampaignTable.findFirst({
    where: and(
      eq(lifecycleCampaignTable.id, campaignId),
      isNull(lifecycleCampaignTable.deletedAt),
    ),
  });
  if (!campaign) {
    throw new ORPCError("NOT_FOUND", { message: "Campaign not found" });
  }
  await assertBrandAccess(organizationId, campaign.brandId);
  return campaign;
}

async function assertValidParent(input: {
  organizationId: string;
  programId: string;
  parentStepId?: string | null;
  selfId?: string;
}) {
  if (!input.parentStepId) return;
  if (input.selfId === input.parentStepId) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A step cannot branch from itself",
    });
  }
  const parent = await db.query.lifecycleProgramStepTable.findFirst({
    where: eq(lifecycleProgramStepTable.id, input.parentStepId),
    columns: { id: true, programId: true },
  });
  if (parent?.programId !== input.programId) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Branch parent must be a step of the same program",
    });
  }
  await assertProgramAccess(input.organizationId, parent.programId);
}

export async function getLifecycleOverview(input: {
  organizationId: string;
  brandId?: string;
  includeCampaigns?: boolean;
}) {
  const brandIds = input.brandId
    ? [(await assertBrandAccess(input.organizationId, input.brandId)).id]
    : await organizationBrandIds(input.organizationId);
  if (brandIds.length === 0) {
    return { programs: [], campaigns: [], campaignSummary: [] };
  }

  const [programs, campaigns] = await Promise.all([
    db.query.lifecycleProgramTable.findMany({
      where: and(
        inArray(lifecycleProgramTable.brandId, brandIds),
        isNull(lifecycleProgramTable.deletedAt),
      ),
      with: {
        steps: {
          orderBy: [
            asc(lifecycleProgramStepTable.delayMinutes),
            asc(lifecycleProgramStepTable.position),
          ],
          with: {
            campaign: { columns: { id: true, name: true, runState: true } },
          },
        },
        campaigns: {
          columns: {
            id: true,
            name: true,
            runState: true,
            provider: true,
            triggerEvent: true,
          },
        },
      },
    }),
    db.query.lifecycleCampaignTable.findMany({
      where: and(
        inArray(lifecycleCampaignTable.brandId, brandIds),
        isNull(lifecycleCampaignTable.deletedAt),
      ),
      columns: {
        id: true,
        name: true,
        runState: true,
        brandId: true,
        programId: true,
        provider: true,
        cleanupStatus: true,
      },
      orderBy: [asc(lifecycleCampaignTable.name)],
    }),
  ]);

  const campaignSummary = Object.entries(
    campaigns.reduce<Record<string, number>>((summary, campaign) => {
      const key = `${campaign.runState}:${campaign.cleanupStatus}`;
      summary[key] = (summary[key] ?? 0) + 1;
      return summary;
    }, {}),
  ).map(([key, count]) => {
    const [runState, cleanupStatus] = key.split(":");
    return { runState, cleanupStatus, count };
  });

  return {
    programs: programs.map((program) => ({
      ...program,
      coverage: lifecycleCoverageOf(program.steps, program.targetTouchpoints),
    })),
    campaigns: input.includeCampaigns === false ? [] : campaigns,
    campaignSummary,
  };
}

export async function getLifecycleProgram(input: {
  organizationId: string;
  programId: string;
}) {
  await assertProgramAccess(input.organizationId, input.programId);
  const program = await db.query.lifecycleProgramTable.findFirst({
    where: and(
      eq(lifecycleProgramTable.id, input.programId),
      isNull(lifecycleProgramTable.deletedAt),
    ),
    with: {
      brand: { columns: { id: true, name: true } },
      steps: {
        orderBy: [
          asc(lifecycleProgramStepTable.delayMinutes),
          asc(lifecycleProgramStepTable.position),
        ],
        with: {
          campaign: {
            columns: {
              id: true,
              name: true,
              runState: true,
              provider: true,
            },
          },
        },
      },
      campaigns: {
        with: { touchpoints: true },
        orderBy: [asc(lifecycleCampaignTable.name)],
      },
    },
  });
  if (!program) {
    throw new ORPCError("NOT_FOUND", { message: "Program not found" });
  }
  return {
    ...program,
    coverage: lifecycleCoverageOf(program.steps, program.targetTouchpoints),
  };
}

export async function searchLifecycleCampaigns(input: {
  organizationId: string;
  filters: z.infer<typeof lifecycleCampaignSearchSchema>;
}) {
  const filters = lifecycleCampaignSearchSchema.parse(input.filters);
  const brandIds = filters.brandId
    ? [(await assertBrandAccess(input.organizationId, filters.brandId)).id]
    : await organizationBrandIds(input.organizationId);
  if (brandIds.length === 0) return [];

  return db.query.lifecycleCampaignTable.findMany({
    where: and(
      inArray(lifecycleCampaignTable.brandId, brandIds),
      isNull(lifecycleCampaignTable.deletedAt),
      ...(filters.query
        ? [
            or(
              ilike(lifecycleCampaignTable.name, `%${filters.query}%`),
              ilike(lifecycleCampaignTable.triggerEvent, `%${filters.query}%`),
            ),
          ]
        : []),
      ...(filters.runStates?.length
        ? [inArray(lifecycleCampaignTable.runState, filters.runStates)]
        : []),
      ...(filters.cleanupStatuses?.length
        ? [
            inArray(
              lifecycleCampaignTable.cleanupStatus,
              filters.cleanupStatuses,
            ),
          ]
        : []),
      ...(filters.unlinkedOnly
        ? [isNull(lifecycleCampaignTable.programId)]
        : []),
    ),
    with: {
      touchpoints: {
        columns: { id: true, name: true, subject: true, channel: true },
      },
      program: { columns: { id: true, name: true } },
    },
    orderBy: [
      desc(lifecycleCampaignTable.lastSentAt),
      asc(lifecycleCampaignTable.name),
    ],
    limit: filters.limit,
  });
}

export async function getLifecycleGaps(input: {
  organizationId: string;
  brandId?: string;
}) {
  const overview = await getLifecycleOverview({
    ...input,
    includeCampaigns: true,
  });
  return {
    programs: overview.programs.filter(
      (program) => program.coverage !== "covered",
    ),
    unlinkedCampaigns: overview.campaigns.filter(
      (campaign) => campaign.programId === null,
    ),
    cleanupCandidates: overview.campaigns.filter((campaign) =>
      ["candidate", "should_delete"].includes(campaign.cleanupStatus),
    ),
  };
}

export async function createLifecycleProgram(input: {
  organizationId: string;
  program: z.infer<typeof lifecycleProgramCreateSchema>;
}) {
  const program = lifecycleProgramCreateSchema.parse(input.program);
  await assertBrandAccess(input.organizationId, program.brandId);
  const [created] = await db
    .insert(lifecycleProgramTable)
    .values(program)
    .returning();
  if (!created) throw new Error("Could not create lifecycle program");
  return created;
}

export async function updateLifecycleProgram(input: {
  organizationId: string;
  programId: string;
  changes: z.infer<typeof lifecycleProgramChangesSchema>;
}) {
  await assertProgramAccess(input.organizationId, input.programId);
  const changes = lifecycleProgramChangesSchema.parse(input.changes);
  const [updated] = await db
    .update(lifecycleProgramTable)
    .set(changes)
    .where(eq(lifecycleProgramTable.id, input.programId))
    .returning();
  if (!updated) {
    throw new ORPCError("NOT_FOUND", { message: "Program not found" });
  }
  return updated;
}

export async function setLifecycleProgramArchived(input: {
  organizationId: string;
  programId: string;
  archived: boolean;
}) {
  await assertProgramAccess(input.organizationId, input.programId, true);
  const [updated] = await db
    .update(lifecycleProgramTable)
    .set({ deletedAt: input.archived ? new Date() : null })
    .where(eq(lifecycleProgramTable.id, input.programId))
    .returning();
  if (!updated) {
    throw new ORPCError("NOT_FOUND", { message: "Program not found" });
  }
  return updated;
}

export async function addLifecycleStep(input: {
  organizationId: string;
  step: z.infer<typeof lifecycleStepCreateSchema>;
}) {
  const step = lifecycleStepCreateSchema.parse(input.step);
  await assertProgramAccess(input.organizationId, step.programId);
  await assertValidParent({
    organizationId: input.organizationId,
    programId: step.programId,
    parentStepId: step.parentStepId,
  });
  const { programId, ...values } = step;
  const [{ value: maxPosition } = { value: null }] = await db
    .select({ value: max(lifecycleProgramStepTable.position) })
    .from(lifecycleProgramStepTable)
    .where(eq(lifecycleProgramStepTable.programId, programId));
  const [created] = await db
    .insert(lifecycleProgramStepTable)
    .values({
      programId,
      position: values.position ?? (maxPosition ?? -1) + 1,
      ...values,
    })
    .returning();
  if (!created) throw new Error("Could not create lifecycle step");
  return created;
}

export async function updateLifecycleStep(input: {
  organizationId: string;
  stepId: string;
  changes: z.infer<typeof lifecycleStepChangesSchema>;
}) {
  const step = await db.query.lifecycleProgramStepTable.findFirst({
    where: eq(lifecycleProgramStepTable.id, input.stepId),
  });
  if (!step) {
    throw new ORPCError("NOT_FOUND", { message: "Step not found" });
  }
  await assertProgramAccess(input.organizationId, step.programId);
  const changes = lifecycleStepChangesSchema.parse(input.changes);
  await assertValidParent({
    organizationId: input.organizationId,
    programId: step.programId,
    parentStepId: changes.parentStepId,
    selfId: step.id,
  });
  const [updated] = await db
    .update(lifecycleProgramStepTable)
    .set(changes)
    .where(eq(lifecycleProgramStepTable.id, step.id))
    .returning();
  if (!updated) {
    throw new ORPCError("NOT_FOUND", { message: "Step not found" });
  }
  return updated;
}

export async function linkLifecycleCampaign(input: {
  organizationId: string;
  campaignId: string;
  programId: string | null;
}) {
  const campaign = await assertCampaignAccess(
    input.organizationId,
    input.campaignId,
  );
  if (input.programId) {
    const program = await assertProgramAccess(
      input.organizationId,
      input.programId,
    );
    if (program.brandId !== campaign.brandId) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Campaign and program must belong to the same brand",
      });
    }
  }
  const [updated] = await db
    .update(lifecycleCampaignTable)
    .set({ programId: input.programId })
    .where(eq(lifecycleCampaignTable.id, campaign.id))
    .returning();
  if (!updated) {
    throw new ORPCError("NOT_FOUND", { message: "Campaign not found" });
  }
  return updated;
}

export async function setLifecycleCampaignCleanupStatus(input: {
  organizationId: string;
  campaignId: string;
  cleanupStatus: z.infer<typeof lifecycleCleanupStatusSchema>;
}) {
  const campaign = await assertCampaignAccess(
    input.organizationId,
    input.campaignId,
  );
  const cleanupStatus = lifecycleCleanupStatusSchema.parse(input.cleanupStatus);
  const [updated] = await db
    .update(lifecycleCampaignTable)
    .set({ cleanupStatus })
    .where(eq(lifecycleCampaignTable.id, campaign.id))
    .returning();
  if (!updated) {
    throw new ORPCError("NOT_FOUND", { message: "Campaign not found" });
  }
  return updated;
}
