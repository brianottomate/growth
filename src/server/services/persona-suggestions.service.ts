import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import { db } from "@/server/db";
import { brandTable, personaTable } from "@/server/db/schema";
import {
  personaProfileSchema,
  generatedPersonaProfileSchema,
  creativeDirectionText,
} from "@/lib/brand-direction";
import { operatorSteeringSection } from "@/lib/generation-steer";
import { requirePersonaEvidence } from "@/lib/brand-evidence";
import { newPersonaSuggestions } from "@/lib/persona-suggestions";
import { personaSuggestionsPrompt } from "@/server/ai/prompts";
const suggestionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  profile: personaProfileSchema,
});
export async function suggestBrandPersonas(
  input: {
    brandId: string;
    steer?: string;
    context?: string;
    personaId?: string;
  },
  organizationId: string,
) {
  const owned = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, input.brandId),
      eq(brandTable.organizationId, organizationId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true },
  });
  if (!owned) throw new Error("Brand not found in this workspace.");
  const [brand, existing] = await Promise.all([
    db.query.brandTable.findFirst({
      where: eq(brandTable.id, input.brandId),
      columns: {
        name: true,
        description: true,
        story: true,
        creativeDirection: true,
      },
    }),
    db.query.personaTable.findMany({
      where: and(
        eq(personaTable.brandId, input.brandId),
        isNull(personaTable.deletedAt),
      ),
      columns: { id: true, name: true, description: true, profile: true },
    }),
  ]);
  const target = input.personaId
    ? existing.find((p) => p.id === input.personaId)
    : null;
  if (input.personaId && !target)
    throw new Error("That persona is not active on this brand.");
  const { system, prompt } = personaSuggestionsPrompt(
    JSON.stringify({
      brand,
      existing,
      target,
      context: input.context ?? null,
    }),
  );
  const { output } = await generateText({
    model: anthropic("claude-sonnet-5"),
    system:
      system +
      " Return a compact profile with icon, motivation and pills. Pick an icon from the available enum; it is a visual cue, not a demographic fact. Motivation is one natural sentence under 25 words, without a Hypothesis prefix. Combine the strongest needs, selection criteria and concerns into one set of two to five distinct pills, each 2–5 words. Use positive, natural phrases such as Accurate photos rather than Photos may mismatch. Do not generate separate categories or an evidence note. Keep names to 2–5 words and at most 60 characters, and descriptions to one sentence under 160 characters. Do not invent measured customer behavior. When target is supplied, propose one revision of that persona.",
    prompt:
      prompt +
      "\n" +
      creativeDirectionText(brand?.creativeDirection) +
      operatorSteeringSection(input.steer),
    output: Output.object({
      schema: z.object({
        suggestions: z
          .array(
            suggestionSchema.extend({
              name: z.string().trim().min(1).max(60),
              description: z.string().trim().min(1).max(160),
              profile: generatedPersonaProfileSchema,
            }),
          )
          .max(3),
        insufficientEvidence: z.boolean(),
        reason: z.string(),
      }),
    }),
  });
  if (!output)
    throw new Error(
      "No persona suggestions were returned. Try again or Shape them in conversation.",
    );
  requirePersonaEvidence(output, existing.length);
  return {
    suggestions: target
      ? output.suggestions.slice(0, 1)
      : newPersonaSuggestions(
          output.suggestions,
          existing.map((row) => row.name),
        ),
  };
}
