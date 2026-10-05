import "server-only";
import { z } from "zod";
import { growthAction } from "./types";
import { launchItemSchema, launchPatchSchema } from "@/lib/launch-checklist";
import {
  readLaunchRecord,
  recordLaunchChecklist,
} from "@/server/services/launch-checklist.service";
const event = z.object({
  item: launchItemSchema,
  checked: z.boolean(),
  skipped: z.boolean().optional(),
  by: z.string().nullable(),
  byName: z.string().nullable().optional(),
  source: z.enum(["manual", "assistant", "workflow"]),
  at: z.string(),
  evidence: z.string().nullable(),
});
const outputSchema = z.object({
  revision: z.number(),
  items: z.partialRecord(launchItemSchema, event),
  history: z.array(event),
  receipts: z.array(z.string()),
});
export const launchChecklistAction = growthAction({
  description:
    "Read the explicitly recorded client onboarding checklist and provenance. No completion is inferred from assets or provider state.",
  inputSchema: z.object({ brandId: z.string().min(1) }),
  outputSchema,
  execute: (input, ctx) => readLaunchRecord(input.brandId, ctx.orgId),
});
export const recordLaunchChecklistAction = growthAction({
  description:
    "Record one or many client onboarding milestones as checked, unchecked or skipped in a single atomic update, optionally dated (YYYY-MM-DD) to when the milestone happened. This only records progress; it never performs the milestone. Read the revision first and send expectedRevision. Evidence is an optional explanatory reference.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    patch: launchPatchSchema,
    expectedRevision: z.number().int().nonnegative(),
    evidence: z.string().max(500).optional(),
  }),
  outputSchema,
  execute: (input, ctx) =>
    recordLaunchChecklist({
      ...input,
      orgId: ctx.orgId,
      by: ctx.userId ?? null,
      source: "assistant",
    }),
});
