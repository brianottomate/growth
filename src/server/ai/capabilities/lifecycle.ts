import "server-only";
import { z } from "zod";
import {
  addLifecycleStep,
  createLifecycleProgram,
  getLifecycleGaps,
  getLifecycleOverview,
  getLifecycleProgram,
  lifecycleCampaignSearchSchema,
  lifecycleCleanupStatusSchema,
  lifecycleProgramChangesSchema,
  lifecycleProgramCreateSchema,
  lifecycleStepChangesSchema,
  lifecycleStepCreateSchema,
  linkLifecycleCampaign,
  searchLifecycleCampaigns,
  setLifecycleCampaignCleanupStatus,
  setLifecycleProgramArchived,
  updateLifecycleProgram,
  updateLifecycleStep,
} from "@/server/services/lifecycle.service";
import { growthAction, growthDomainTool } from "./types";
import * as outputs from "./outputs/lifecycle";

export const lifecycleRead = growthDomainTool({
  description:
    "Read lifecycle strategy and mirrored delivery reality. Reads never change provider state.",
  actions: {
    overview: growthAction({
      description: "Read compact lifecycle program coverage.",
      inputSchema: z.object({ brandId: z.string().optional() }),
      outputSchema: outputs.overviewResultSchema,
      execute: (input, ctx) =>
        getLifecycleOverview({
          organizationId: ctx.orgId,
          ...input,
          includeCampaigns: false,
        }),
    }),
    inspectProgram: growthAction({
      description: "Read one complete lifecycle journey.",
      inputSchema: z.object({ programId: z.string() }),
      outputSchema: outputs.inspectProgramResultSchema,
      execute: (input, ctx) =>
        getLifecycleProgram({ organizationId: ctx.orgId, ...input }),
    }),
    searchCampaigns: growthAction({
      description: "Find mirrored Customer.io, Outreach and HubSpot campaigns.",
      inputSchema: lifecycleCampaignSearchSchema,
      outputSchema: outputs.searchCampaignsResultSchema,
      execute: (filters, ctx) =>
        searchLifecycleCampaigns({ organizationId: ctx.orgId, filters }),
    }),
    findGaps: growthAction({
      description:
        "Find uncovered programs, unlinked campaigns and cleanup candidates.",
      inputSchema: z.object({ brandId: z.string().optional() }),
      outputSchema: outputs.findGapsResultSchema,
      execute: (input, ctx) =>
        getLifecycleGaps({ organizationId: ctx.orgId, ...input }),
    }),
  },
});

export const lifecycleWrite = growthDomainTool({
  description:
    "Apply local lifecycle strategy and mirror changes. These operations never send or change delivery in a provider.",
  actions: {
    createProgram: growthAction({
      description: "Create a local lifecycle program.",
      inputSchema: lifecycleProgramCreateSchema,
      outputSchema: outputs.programResultSchema,
      execute: async (program, ctx) => {
        const created = await createLifecycleProgram({
          organizationId: ctx.orgId,
          program,
        });
        return { program: created, url: `/app/lifecycle/${created.id}` };
      },
    }),
    updateProgram: growthAction({
      description: "Update a local lifecycle program.",
      inputSchema: z.object({
        programId: z.string(),
        changes: lifecycleProgramChangesSchema,
      }),
      outputSchema: outputs.programResultSchema,
      execute: async (input, ctx) => {
        const program = await updateLifecycleProgram({
          organizationId: ctx.orgId,
          ...input,
        });
        return { program, url: `/app/lifecycle/${program.id}` };
      },
    }),
    addStep: growthAction({
      description: "Add a step to a local lifecycle program.",
      inputSchema: lifecycleStepCreateSchema,
      outputSchema: outputs.stepResultSchema,
      execute: async (step, ctx) => {
        const created = await addLifecycleStep({
          organizationId: ctx.orgId,
          step,
        });
        return { step: created, url: `/app/lifecycle/${created.programId}` };
      },
    }),
    updateStep: growthAction({
      description: "Update a local lifecycle step.",
      inputSchema: z.object({
        stepId: z.string(),
        changes: lifecycleStepChangesSchema,
      }),
      outputSchema: outputs.stepResultSchema,
      execute: async (input, ctx) => {
        const step = await updateLifecycleStep({
          organizationId: ctx.orgId,
          ...input,
        });
        return { step, url: `/app/lifecycle/${step.programId}` };
      },
    }),
    linkCampaign: growthAction({
      description:
        "Link or unlink a mirrored campaign and a local lifecycle program.",
      inputSchema: z.object({
        campaignId: z.string(),
        programId: z.string().nullable(),
      }),
      outputSchema: outputs.campaignResultSchema,
      execute: async (input, ctx) => ({
        campaign: await linkLifecycleCampaign({
          organizationId: ctx.orgId,
          ...input,
        }),
        url: input.programId
          ? `/app/lifecycle/${input.programId}`
          : "/app/lifecycle",
      }),
    }),
    setCleanupStatus: growthAction({
      description:
        "Classify a mirrored campaign for cleanup without changing provider delivery.",
      inputSchema: z.object({
        campaignId: z.string(),
        cleanupStatus: lifecycleCleanupStatusSchema,
      }),
      outputSchema: outputs.campaignResultSchema,
      execute: async (input, ctx) => ({
        campaign: await setLifecycleCampaignCleanupStatus({
          organizationId: ctx.orgId,
          ...input,
        }),
        url: "/app/lifecycle?view=mirror",
      }),
    }),
    archiveProgram: growthAction({
      description:
        "Archive a local lifecycle program. Provider delivery stays unchanged.",
      inputSchema: z.object({ programId: z.string() }),
      outputSchema: outputs.programResultSchema,
      execute: async (input, ctx) => ({
        program: await setLifecycleProgramArchived({
          organizationId: ctx.orgId,
          ...input,
          archived: true,
        }),
        url: "/app/lifecycle",
      }),
    }),
    restoreProgram: growthAction({
      description: "Restore an archived local lifecycle program.",
      inputSchema: z.object({ programId: z.string() }),
      outputSchema: outputs.programResultSchema,
      execute: async (input, ctx) => ({
        program: await setLifecycleProgramArchived({
          organizationId: ctx.orgId,
          ...input,
          archived: false,
        }),
        url: "/app/lifecycle",
      }),
    }),
  },
});

export const LIFECYCLE_TOOLS = { lifecycleRead, lifecycleWrite } as const;
