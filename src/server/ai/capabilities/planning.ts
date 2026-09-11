import "server-only";

import { z } from "zod";

import { requireOwnedBrand } from "./brand-access";
import { growthAction } from "./types";
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

export const previewTwoWeekSlots = growthAction({
  description:
    "Preview the concrete empty content slots implied by an owned brand's active cadence and content-mix targets for the next 14 days. Saves nothing. Use after nextForBrand says the brand is ready to plan; summarize the result briefly before offering to create it.",
  inputSchema: z.object({
    brandId: z.string(),
    startDateISO: z.string().date().optional(),
  }),
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
      unconfiguredChannels: result.unconfiguredChannels,
      unconfiguredMixChannels: result.unconfiguredMixChannels,
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
        result.unconfiguredChannels.length > 0
          ? "Establish cadence for the unconfigured channels before creating the plan."
          : result.unconfiguredMixChannels.length > 0
            ? "Establish a brand or channel content mix before creating the plan."
            : result.created > 0
              ? "Ask the operator for an explicit conversational go-ahead to create this two-week slot plan."
              : "The window already satisfies the active cadence targets.",
    };
  },
});

export const generateTwoWeekSlots = growthAction({
  description:
    "Create the approved 14-day set of empty content slots implied by an owned brand's active cadence and content-mix targets. This is idempotent and only tops up missing cadence slots. Use only after previewTwoWeekSlots and explicit operator agreement.",
  inputSchema: z.object({
    brandId: z.string(),
    startDateISO: z.string().date().optional(),
  }),
  // The assistant must preview first and receive an explicit conversational
  // go-ahead. Requiring another generic approval card after "yes" is redundant;
  // slot creation is idempotent and does not overwrite existing content.
  execute: async ({ brandId, startDateISO }, ctx) => {
    await requireOwnedBrand(brandId, ctx);
    const { start, end } = twoWeekWindow(startDateISO);
    const result = await generateRangeSlots({
      brandId,
      rangeStart: start,
      rangeEnd: end,
    });
    return {
      action: "saved" as const,
      created: result.created,
      mix: result.mix,
      unconfiguredChannels: result.unconfiguredChannels,
      unconfiguredMixChannels: result.unconfiguredMixChannels,
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

export const PLANNING_TOOLS = {
  previewTwoWeekSlots,
  generateTwoWeekSlots,
} as const;
