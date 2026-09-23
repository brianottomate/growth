import { workspaceOverviewOutputSchema } from "./outputs/overview";
import "server-only";

import { z } from "zod";

import { growthTool } from "./types";
import { listBrands } from "./brands";
import { contentPipelineSummary, needsAttentionCount } from "./content";
import { leadsSummary } from "./leads";
import { recentMentions } from "./listening";

/**
 * The home-screen aggregator: one call that fans out to the per-domain
 * capabilities and rolls their headline numbers into a single snapshot. Doubles
 * as a demonstration that capabilities compose — workspaceOverview is just
 * another capability that calls others.
 */
export const workspaceOverview = growthTool({
  resultSchema: workspaceOverviewOutputSchema,
  description:
    "One-shot snapshot of the whole growth workspace: brand count, content pipeline by status, how many posts await a human, leads headline numbers, and the count of engage-worthy social mentions. Call this FIRST for broad 'give me an overview / what's going on / catch me up' questions, then drill in with the more specific tools.",
  inputSchema: z.object({ action: z.literal("overview") }),
  execute: async ({ action }, ctx) => {
    const [brands, content, needsAttention, leads, engage] = await Promise.all([
      listBrands.run({}, ctx),
      contentPipelineSummary.run({}, ctx),
      needsAttentionCount(ctx.orgId),
      leadsSummary.run({}, ctx),
      recentMentions.run({ onlyEngageWorthy: true, limit: 50 }, ctx),
    ]);

    return {
      ok: true as const,
      action,
      data: {
        brands: brands.brands.length,
        content: {
          total: content.total,
          byStatus: content.byStatus,
          needsAttention,
        },
        leads: {
          domains: leads.domains,
          contacts: leads.contacts,
          netNew: leads.netNew,
          inInstantly: leads.inInstantly,
        },
        engageWorthyMentions: engage.count,
      },
    };
  },
});
