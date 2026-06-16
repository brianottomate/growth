import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import {
  generateMomentBlueprint,
  ingestSources,
} from "@/server/services/plan-moment.service";

/**
 * Tool registry for the /plan chat agent — the repo's reference tool-use agent.
 *
 * Each tool is scoped to the caller's org (the org boundary is the access
 * control here) and is SIDE-EFFECT-FREE: read brands, scrape a URL, draft a
 * blueprint. Nothing is written to the DB — the drafted blueprint flows into
 * the /plan review panel, where saving stays a deliberate human action. Every
 * tool returns a plain object that the model reads back AND the client renders.
 */
export function buildPlanTools(ctx: { orgId: string; userId: string }) {
  const brandInOrg = (id: string) =>
    db.query.brandTable.findFirst({
      where: and(eq(brandTable.id, id), eq(brandTable.organizationId, ctx.orgId)),
    });

  return {
    listBrands: tool({
      description:
        "List the brands in the current organization (id, name, tagline). Call this first when you need a brandId and don't already have one.",
      inputSchema: z.object({}),
      execute: async () => {
        const brands = await db.query.brandTable.findMany({
          where: and(
            eq(brandTable.organizationId, ctx.orgId),
            isNull(brandTable.deletedAt),
          ),
          columns: { id: true, name: true, tagline: true },
        });
        return { brands };
      },
    }),

    ingestUrl: tool({
      description:
        "Read a pasted link (press release, landing page) or an image URL into planner input. Returns a brief (scraped page text) + reference image URLs + a suggested name. You cannot fetch URLs yourself — always ingest before planning from a link.",
      inputSchema: z.object({
        url: z.string().describe("a web page URL or a direct image URL"),
      }),
      execute: async ({ url }) => {
        const res = await ingestSources([url]);
        return { name: res.name, imageUrls: res.imageUrls, brief: res.brief };
      },
    }),

    draftBlueprint: tool({
      description:
        "Propose the SHAPE of a content moment (verdict + slots + amplifier asks) for a brand from a brief and/or reference images. Proposes only — saves nothing. Pass the brief from ingestUrl when planning from a link.",
      inputSchema: z.object({
        brandId: z.string(),
        name: z.string().optional().describe("the moment name"),
        prompt: z.string().optional().describe("the brief / context"),
        imageUrls: z.array(z.string()).optional(),
        goal: z.string().optional().describe("short goal slug, e.g. fundraise | supply"),
        scaleHint: z.enum(["single", "arc"]).optional(),
      }),
      execute: async (input) => {
        const brand = await brandInOrg(input.brandId);
        if (!brand) return { error: "Brand not found in this organization." };
        const blueprint = await generateMomentBlueprint({
          brandName: brand.name,
          brandTagline: brand.tagline,
          name: input.name,
          prompt: input.prompt,
          imageUrls: input.imageUrls,
          goal: input.goal,
          scaleHint: input.scaleHint,
        });
        return { blueprint };
      },
    }),
  };
}
