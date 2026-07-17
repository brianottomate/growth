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
import { actionUnionInputSchema } from "@/server/ai/kernel/group";
import { growthTool } from "./types";

const lifecycleReadInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("overview"),
    brandId: z.string().optional(),
  }),
  z.object({
    action: z.literal("inspect_program"),
    programId: z.string(),
  }),
  lifecycleCampaignSearchSchema.extend({
    action: z.literal("search_campaigns"),
  }),
  z.object({
    action: z.literal("find_gaps"),
    brandId: z.string().optional(),
  }),
]);

const lifecycleWriteInputSchema = z.discriminatedUnion("action", [
  lifecycleProgramCreateSchema.extend({
    action: z.literal("create_program"),
  }),
  z.object({
    action: z.literal("update_program"),
    programId: z.string(),
    changes: lifecycleProgramChangesSchema,
  }),
  lifecycleStepCreateSchema.extend({
    action: z.literal("add_step"),
  }),
  z.object({
    action: z.literal("update_step"),
    stepId: z.string(),
    changes: lifecycleStepChangesSchema,
  }),
  z.object({
    action: z.literal("link_campaign"),
    campaignId: z.string(),
    programId: z.string().nullable(),
  }),
  z.object({
    action: z.literal("set_cleanup_status"),
    campaignId: z.string(),
    cleanupStatus: lifecycleCleanupStatusSchema,
  }),
  z.object({
    action: z.enum(["archive_program", "restore_program"]),
    programId: z.string(),
  }),
]);

/** One read contract for the lifecycle capability. */
export const lifecycleRead = growthTool({
  description:
    "Read lifecycle strategy and mirrored delivery reality. Use action=overview for compact program coverage, inspect_program for one complete journey, search_campaigns to find matching Customer.io/Outreach/HubSpot mirrors, or find_gaps for uncovered programs, unlinked campaigns, and cleanup candidates. Reads never change provider state.",
  inputSchema: actionUnionInputSchema(
    lifecycleReadInputSchema,
  ) as unknown as typeof lifecycleReadInputSchema,
  execute: async (input, ctx) => {
    switch (input.action) {
      case "overview":
        return getLifecycleOverview({
          organizationId: ctx.orgId,
          brandId: input.brandId,
          includeCampaigns: false,
        });
      case "inspect_program":
        return getLifecycleProgram({
          organizationId: ctx.orgId,
          programId: input.programId,
        });
      case "search_campaigns": {
        const { action: _, ...filters } = input;
        return searchLifecycleCampaigns({
          organizationId: ctx.orgId,
          filters,
        });
      }
      case "find_gaps":
        return getLifecycleGaps({
          organizationId: ctx.orgId,
          brandId: input.brandId,
        });
    }
  },
});

/** One write contract for local lifecycle intent and mirror classification. */
export const lifecycleWrite = growthTool({
  description:
    "Apply an explicit lifecycle workspace change. It can create or update strategic programs and steps, link or unlink a mirrored campaign, classify a cleanup candidate, or archive/restore a program. It never edits, starts, stops, sends, or deletes anything in Customer.io, Outreach, HubSpot, or another provider.",
  inputSchema: actionUnionInputSchema(
    lifecycleWriteInputSchema,
  ) as unknown as typeof lifecycleWriteInputSchema,
  execute: async (input, ctx) => {
    switch (input.action) {
      case "create_program": {
        const { action: _, ...program } = input;
        const created = await createLifecycleProgram({
          organizationId: ctx.orgId,
          program,
        });
        return {
          action: input.action,
          program: created,
          url: `/app/lifecycle/${created.id}`,
        };
      }
      case "update_program": {
        const updated = await updateLifecycleProgram({
          organizationId: ctx.orgId,
          programId: input.programId,
          changes: input.changes,
        });
        return {
          action: input.action,
          program: updated,
          url: `/app/lifecycle/${updated.id}`,
        };
      }
      case "add_step": {
        const { action: _, ...step } = input;
        const created = await addLifecycleStep({
          organizationId: ctx.orgId,
          step,
        });
        return {
          action: input.action,
          step: created,
          url: `/app/lifecycle/${created.programId}`,
        };
      }
      case "update_step": {
        const updated = await updateLifecycleStep({
          organizationId: ctx.orgId,
          stepId: input.stepId,
          changes: input.changes,
        });
        return {
          action: input.action,
          step: updated,
          url: `/app/lifecycle/${updated.programId}`,
        };
      }
      case "link_campaign": {
        const updated = await linkLifecycleCampaign({
          organizationId: ctx.orgId,
          campaignId: input.campaignId,
          programId: input.programId,
        });
        return {
          action: input.action,
          campaign: updated,
          url: input.programId
            ? `/app/lifecycle/${input.programId}`
            : "/app/lifecycle",
        };
      }
      case "set_cleanup_status": {
        const updated = await setLifecycleCampaignCleanupStatus({
          organizationId: ctx.orgId,
          campaignId: input.campaignId,
          cleanupStatus: input.cleanupStatus,
        });
        return {
          action: input.action,
          campaign: updated,
          url: "/app/lifecycle?view=mirror",
        };
      }
      case "archive_program":
      case "restore_program": {
        const updated = await setLifecycleProgramArchived({
          organizationId: ctx.orgId,
          programId: input.programId,
          archived: input.action === "archive_program",
        });
        return {
          action: input.action,
          program: updated,
          url: "/app/lifecycle",
        };
      }
    }
  },
});

export const LIFECYCLE_TOOLS = { lifecycleRead, lifecycleWrite } as const;
