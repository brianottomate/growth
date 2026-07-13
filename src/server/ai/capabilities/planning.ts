import "server-only";

import { z } from "zod";

import {
  commitMomentBlueprint,
  generateMomentBlueprint,
  momentBlueprintSchema,
  momentSlotSchema,
} from "@/server/services/plan-moment.service";
import { requireOwnedBrand } from "./brand-access";
import { defineCapability } from "./types";
import { generateRangeSlots } from "@/server/services/slot-generate.service";

function twoWeekWindow(startDateISO?: string) {
  const start = startDateISO
    ? new Date(`${startDateISO}T00:00:00.000Z`)
    : new Date();
  if (!startDateISO) {
    start.setUTCDate(start.getUTCDate() + 1);
    start.setUTCHours(0, 0, 0, 0);
  }
  if (Number.isNaN(start.getTime())) throw new Error("Invalid start date.");
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 14);
  return { start, end };
}

export const previewTwoWeekSlots = defineCapability({
  name: "previewTwoWeekSlots",
  description:
    "Preview the concrete empty content slots implied by an owned brand's active cadence and content-mix targets for the next 14 days. Saves nothing. Use after nextForBrand says the brand is ready to plan; summarize the result briefly before offering to create it.",
  inputSchema: z.object({
    brandId: z.string(),
    startDateISO: z.string().date().optional(),
  }),
  readOnly: true,
  domain: "content",
  execute: async ({ brandId, startDateISO }, ctx) => {
    await requireOwnedBrand(brandId, ctx);
    const { start, end } = twoWeekWindow(startDateISO);
    const result = await generateRangeSlots({
      brandId,
      rangeStart: start,
      rangeEnd: end,
      dryRun: true,
    });
    return {
      created: result.created,
      mix: result.mix,
      slots: result.rows.map((row) => ({
        platform: row.platform,
        archetype: row.archetype,
        authoredCadence: `${row.count}/${row.period}`,
        targetInWindow: row.target,
        existingInWindow: row.existing,
        missingInWindow: row.created,
      })),
      window: { start: start.toISOString(), end: end.toISOString() },
      interpretation:
        "targetInWindow and existingInWindow are totals for the full 14-day window. authoredCadence is the underlying weekly/monthly setting; do not describe targetInWindow as a per-week value.",
      next:
        result.created > 0
          ? "Ask the operator to approve creating this two-week slot plan."
          : "The window already satisfies the active cadence targets.",
    };
  },
});

export const generateTwoWeekSlots = defineCapability({
  name: "generateTwoWeekSlots",
  description:
    "Create the approved 14-day set of empty content slots implied by an owned brand's active cadence and content-mix targets. This is idempotent and only tops up missing cadence slots. Use only after previewTwoWeekSlots and explicit operator agreement.",
  inputSchema: z.object({
    brandId: z.string(),
    startDateISO: z.string().date().optional(),
  }),
  readOnly: false,
  domain: "content",
  execute: async ({ brandId, startDateISO }, ctx) => {
    await requireOwnedBrand(brandId, ctx);
    const { start, end } = twoWeekWindow(startDateISO);
    const result = await generateRangeSlots({
      brandId,
      rangeStart: start,
      rangeEnd: end,
    });
    return {
      created: result.created,
      mix: result.mix,
      slots: result.rows.map((row) => ({
        platform: row.platform,
        archetype: row.archetype,
        authoredCadence: `${row.count}/${row.period}`,
        targetInWindow: row.target,
        existingInWindow: row.existing,
        createdInWindow: row.created,
      })),
      window: { start: start.toISOString(), end: end.toISOString() },
      scheduleUrl: `/app/content?brandId=${brandId}&view=schedule`,
    };
  },
});

export const draftMomentBlueprint = defineCapability({
  name: "draftMomentBlueprint",
  description:
    "Propose a reviewable content moment shape: verdict, scale, slots, channel renderings, and amplifier asks. Saves nothing. Use this after the brand context and desired outcome are clear; the operator can refine the blueprint before committing it.",
  inputSchema: z.object({
    brandId: z.string(),
    name: z.string().optional(),
    prompt: z.string().optional(),
    imageUrls: z.array(z.string().url()).optional(),
    goal: z.string().optional(),
    scaleHint: z.enum(["single", "arc"]).optional(),
    refine: z
      .object({
        keepSlots: z.array(momentSlotSchema),
        blanks: z.number().int().min(0).optional(),
        drop: z.array(z.string()).optional(),
        steer: z.string().optional(),
      })
      .optional(),
  }),
  readOnly: true,
  domain: "content",
  execute: async (input, ctx) => {
    const brand = await requireOwnedBrand(input.brandId, ctx);
    const blueprint = await generateMomentBlueprint({
      brandName: brand.name,
      brandTagline: brand.tagline,
      name: input.name,
      prompt: input.prompt,
      imageUrls: input.imageUrls,
      goal: input.goal,
      scaleHint: input.scaleHint,
      refine: input.refine,
    });
    return { blueprint, next: "Review or refine, then call commitMomentPlan." };
  },
});

export const commitMomentPlan = defineCapability({
  name: "commitMomentPlan",
  description:
    "Materialize an explicitly approved moment blueprint into one initiative, optional series for an arc, concrete content slots, and amplifier targets. Call only with the final reviewed blueprint and launch date.",
  inputSchema: z.object({
    brandId: z.string(),
    name: z.string().min(1),
    launchDateISO: z.string(),
    blueprint: momentBlueprintSchema,
  }),
  readOnly: false,
  domain: "content",
  execute: async (input, ctx) => {
    await requireOwnedBrand(input.brandId, ctx);
    const result = await commitMomentBlueprint(input);
    return {
      ...result,
      planUrl: `/app/content?brandId=${input.brandId}&view=schedule`,
    };
  },
});

export const PLANNING_CAPABILITIES = [
  previewTwoWeekSlots,
  generateTwoWeekSlots,
  draftMomentBlueprint,
  commitMomentPlan,
];
