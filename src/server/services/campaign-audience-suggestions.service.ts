import { deliveryGeographySchema } from "@/lib/platform-delivery";
import { campaignAudiencesPickPrompt } from "@/server/ai/prompts/campaign-audiences";
import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { operatorSteeringSection } from "@/lib/generation-steer";
import { db } from "@/server/db";
import { audienceTable, brandTable, personaTable } from "@/server/db/schema";
import { requireOwnedCampaign } from "./ads-draft.service";

const suggestionSchema = z.strictObject({
  name: z.string().trim().min(1).max(300),
  personaId: z.string().nullable(),
  why: z.string().trim().min(1).max(4000),
  geography: deliveryGeographySchema.nullable(),
});
export type AudienceSuggestion = z.infer<typeof suggestionSchema>;

/** General reasoning never fetches inventory or booking analytics implicitly. */
export async function suggestCampaignAudiences(input: {
  organizationId: string;
  campaignId: string;
  count?: number;
  steer?: string;
  context?: string;
}) {
  const { campaign, brand: owned } = await requireOwnedCampaign(
    input.campaignId,
    input.organizationId,
  );
  const [brand, personas, current] = await Promise.all([
    db.query.brandTable.findFirst({
      where: eq(brandTable.id, owned.id),
      columns: { name: true, story: true, creativeDirection: true },
    }),
    db.query.personaTable.findMany({
      where: and(
        eq(personaTable.brandId, owned.id),
        isNull(personaTable.deletedAt),
      ),
    }),
    db.query.audienceTable.findMany({
      where: eq(audienceTable.campaignId, campaign.id),
    }),
  ]);
  const { output } = await generateText({
    model: anthropic("claude-sonnet-5"),
    system: campaignAudiencesPickPrompt({
      brandName: owned.name,
      story: brand?.story ?? "",
      count: input.count ?? 1,
    }),
    prompt:
      JSON.stringify({
        campaign: {
          name: campaign.name,
          description: campaign.description,
          goal: campaign.goal,
        },
        brand,
        personas,
        current,
        researchContext: input.context ?? null,
        count: Math.min(Math.max(input.count ?? 1, 1), 5),
      }) + operatorSteeringSection(input.steer),
    output: Output.object({
      schema: z.object({ suggestions: z.array(suggestionSchema).max(5) }),
    }),
  });
  if (!output) throw new Error("No audience suggestions returned");
  const known = new Set(personas.map((p) => p.id));
  if (output.suggestions.some((s) => s.personaId && !known.has(s.personaId)))
    throw new Error("Suggested persona is not active on this brand");
  return {
    campaignId: campaign.id,
    suggestions: output.suggestions.slice(0, input.count ?? 1),
  };
}
