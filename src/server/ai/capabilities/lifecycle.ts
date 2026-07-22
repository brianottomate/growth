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
import { actionUnionTransportSchemas } from "../kernel/tool";
import { growthTool } from "./types";

const lifecycleReadInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("overview"),
    brandId: z.string().optional(),
  }),
  z.object({
    action: z.literal("inspectProgram"),
    programId: z.string(),
  }),
  lifecycleCampaignSearchSchema.extend({
    action: z.literal("searchCampaigns"),
  }),
  z.object({
    action: z.literal("findGaps"),
    brandId: z.string().optional(),
  }),
]);

const lifecycleWriteInputSchema = z.discriminatedUnion("action", [
  lifecycleProgramCreateSchema.extend({
    action: z.literal("createProgram"),
  }),
  z.object({
    action: z.literal("updateProgram"),
    programId: z.string(),
    changes: lifecycleProgramChangesSchema,
  }),
  lifecycleStepCreateSchema.extend({
    action: z.literal("addStep"),
  }),
  z.object({
    action: z.literal("updateStep"),
    stepId: z.string(),
    changes: lifecycleStepChangesSchema,
  }),
  z.object({
    action: z.literal("linkCampaign"),
    campaignId: z.string(),
    programId: z.string().nullable(),
  }),
  z.object({
    action: z.literal("setCleanupStatus"),
    campaignId: z.string(),
    cleanupStatus: lifecycleCleanupStatusSchema,
  }),
  z.object({
    action: z.enum(["archiveProgram", "restoreProgram"]),
    programId: z.string(),
  }),
]);

const lifecycleReadTransport = actionUnionTransportSchemas(
  lifecycleReadInputSchema,
);
const lifecycleWriteTransport = actionUnionTransportSchemas(
  lifecycleWriteInputSchema,
);

/** One read contract for the lifecycle capability. */
export const lifecycleRead = growthTool({
  description:
    "Read lifecycle strategy and mirrored delivery reality. Use overview for compact program coverage, inspectProgram for one complete journey, searchCampaigns to find matching Customer.io/Outreach/HubSpot mirrors, or findGaps for uncovered programs, unlinked campaigns, and cleanup candidates. Reads never change provider state.",
  inputSchema: lifecycleReadInputSchema,
  ...lifecycleReadTransport,
  execute: async (input, ctx) => {
    switch (input.action) {
      case "overview":
        return {
          ok: true as const,
          action: input.action,
          data: await getLifecycleOverview({
            organizationId: ctx.orgId,
            brandId: input.brandId,
            includeCampaigns: false,
          }),
        };
      case "inspectProgram":
        return {
          ok: true as const,
          action: input.action,
          data: await getLifecycleProgram({
            organizationId: ctx.orgId,
            programId: input.programId,
          }),
        };
      case "searchCampaigns": {
        const { action: _, ...filters } = input;
        return {
          ok: true as const,
          action: input.action,
          data: await searchLifecycleCampaigns({
            organizationId: ctx.orgId,
            filters,
          }),
        };
      }
      case "findGaps":
        return {
          ok: true as const,
          action: input.action,
          data: await getLifecycleGaps({
            organizationId: ctx.orgId,
            brandId: input.brandId,
          }),
        };
    }
  },
});

/** One write contract for local lifecycle intent and mirror classification. */
export const lifecycleWrite = growthTool({
  description:
    "Apply an explicit lifecycle workspace change. It can create or update strategic programs and steps, link or unlink a mirrored campaign, classify a cleanup candidate, or archive/restore a program. It never edits, starts, stops, sends, or deletes anything in Customer.io, Outreach, HubSpot, or another provider.",
  inputSchema: lifecycleWriteInputSchema,
  ...lifecycleWriteTransport,
  execute: async (input, ctx) => {
    switch (input.action) {
      case "createProgram": {
        const { action: _, ...program } = input;
        const created = await createLifecycleProgram({
          organizationId: ctx.orgId,
          program,
        });
        return {
          ok: true as const,
          action: input.action,
          data: { program: created, url: `/app/lifecycle/${created.id}` },
        };
      }
      case "updateProgram": {
        const updated = await updateLifecycleProgram({
          organizationId: ctx.orgId,
          programId: input.programId,
          changes: input.changes,
        });
        return {
          ok: true as const,
          action: input.action,
          data: { program: updated, url: `/app/lifecycle/${updated.id}` },
        };
      }
      case "addStep": {
        const { action: _, ...step } = input;
        const created = await addLifecycleStep({
          organizationId: ctx.orgId,
          step,
        });
        return {
          ok: true as const,
          action: input.action,
          data: { step: created, url: `/app/lifecycle/${created.programId}` },
        };
      }
      case "updateStep": {
        const updated = await updateLifecycleStep({
          organizationId: ctx.orgId,
          stepId: input.stepId,
          changes: input.changes,
        });
        return {
          ok: true as const,
          action: input.action,
          data: { step: updated, url: `/app/lifecycle/${updated.programId}` },
        };
      }
      case "linkCampaign": {
        const updated = await linkLifecycleCampaign({
          organizationId: ctx.orgId,
          campaignId: input.campaignId,
          programId: input.programId,
        });
        return {
          ok: true as const,
          action: input.action,
          data: {
            campaign: updated,
            url: input.programId
              ? `/app/lifecycle/${input.programId}`
              : "/app/lifecycle",
          },
        };
      }
      case "setCleanupStatus": {
        const updated = await setLifecycleCampaignCleanupStatus({
          organizationId: ctx.orgId,
          campaignId: input.campaignId,
          cleanupStatus: input.cleanupStatus,
        });
        return {
          ok: true as const,
          action: input.action,
          data: { campaign: updated, url: "/app/lifecycle?view=mirror" },
        };
      }
      case "archiveProgram":
      case "restoreProgram": {
        const updated = await setLifecycleProgramArchived({
          organizationId: ctx.orgId,
          programId: input.programId,
          archived: input.action === "archiveProgram",
        });
        return {
          ok: true as const,
          action: input.action,
          data: { program: updated, url: "/app/lifecycle" },
        };
      }
    }
  },
});

export const LIFECYCLE_TOOLS = { lifecycleRead, lifecycleWrite } as const;
