import { readBrandBookingDemand } from "@/server/services/booking-demand.service";
import { bookingDemandContext } from "@/lib/booking-demand";
import {
  personaProfileSchema,
  generatedPersonaProfileSchema,
  creativeDirectionText,
} from "@/lib/brand-direction";
import { steerSchema, operatorSteeringSection } from "@/lib/generation-steer";
import {
  updatePersonaNativeResultSchema,
  createPersonaNativeResultSchema,
  listPersonasNativeResultSchema,
  listPersonasOutputSchema,
  createPersonaOutputSchema,
  updatePersonaOutputSchema,
  deletePersonaOutputSchema,
  uploadPersonaSeedListOutputSchema,
  createPersonaLookalikeOutputSchema,
  assignPersonaAudienceOutputSchema,
} from "./outputs/personas";

import "server-only";
import { requirePersonaEvidence } from "@/lib/brand-evidence";

import { z } from "zod";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { personaSuggestionsPrompt } from "@/server/ai/prompts";
import { newPersonaSuggestions } from "@/lib/persona-suggestions";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, homeTable, personaTable } from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import {
  assignPersonaAudience,
  createPersonaLookalike,
  uploadPersonaSeedList,
} from "@/server/services/persona-audience.service";
import { growthAction } from "./types";

// ---- PERSONAS ----------------------------------------------------------
//
// The stable brand-level "who" — few, curated, planning-mode only. Loose
// prose arrays here inspire campaign audiences and content; they are never
// ad targeting by themselves. The strict, buyable narrowing is a campaign's
// audience (adsWrite.addAudience), which may point back via personaId.

async function requireOwnedBrand(brandId: string, orgId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true },
  });
  if (!brand) throw new Error("That owned brand is not in your organization.");
  return brand;
}

async function requirePersona(personaId: string, orgId: string) {
  const persona = await db.query.personaTable.findFirst({
    where: and(eq(personaTable.id, personaId), isNull(personaTable.deletedAt)),
  });
  if (!persona) throw new Error("Persona not found");
  await requireOwnedBrand(persona.brandId, orgId);
  return persona;
}

const personaFields = {
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullish(),
  ageRanges: z
    .array(z.string().trim().min(1).max(40))
    .max(10)
    .nullish()
    .describe('Loose prose, e.g. ["30-50"]. Planning only, never targeting.'),
  geographies: z
    .array(z.string().trim().min(1).max(100))
    .max(20)
    .nullish()
    .describe('Loose prose, e.g. ["California", "big US cities"].'),
  notes: z.string().trim().max(4000).nullish(),
  profile: personaProfileSchema.nullish(),
};

export const listPersonas = growthAction({
  nativeOutputSchema: listPersonasNativeResultSchema,
  outputSchema: listPersonasOutputSchema,
  description:
    "List a brand's personas — the stable 'who we talk to' layer, the people counterpart of content pillars.",
  inputSchema: z.object({ brandId: z.string().trim().min(1) }),
  execute: async (input, ctx) => {
    await requireOwnedBrand(input.brandId, ctx.orgId);
    return db.query.personaTable.findMany({
      where: and(
        eq(personaTable.brandId, input.brandId),
        isNull(personaTable.deletedAt),
      ),
      orderBy: [asc(personaTable.createdAt)],
    });
  },
});

export const createPersona = growthAction({
  nativeOutputSchema: createPersonaNativeResultSchema,
  outputSchema: createPersonaOutputSchema,
  description:
    "Create a persona under an owned brand. Personas are few and stable — check the existing list before adding one; geography is optional. A distinct motivation with or without geography is valid; avoid duplicate descriptions.",
  inputSchema: z.object({
    brandId: z.string().trim().min(1),
    ...personaFields,
  }),
  execute: async (input, ctx) => {
    const brand = await requireOwnedBrand(input.brandId, ctx.orgId);
    const [persona] = await db
      .insert(personaTable)
      .values({
        id: createId("pers"),
        brandId: brand.id,
        name: input.name,
        description: input.description ?? null,
        ageRanges: input.ageRanges ?? null,
        geographies: input.geographies ?? null,
        notes: input.notes ?? null,
        profile: input.profile ?? null,
      })
      .returning();
    return persona!;
  },
});

export const updatePersona = growthAction({
  nativeOutputSchema: updatePersonaNativeResultSchema,
  outputSchema: updatePersonaOutputSchema,
  description:
    "Update a persona's fields. Only the fields sent are changed; null clears one.",
  inputSchema: z.object({
    personaId: z.string().trim().min(1),
    name: personaFields.name.optional(),
    description: personaFields.description,
    ageRanges: personaFields.ageRanges,
    geographies: personaFields.geographies,
    notes: personaFields.notes,
    profile: personaFields.profile,
  }),
  execute: async (input, ctx) => {
    const persona = await requirePersona(input.personaId, ctx.orgId);
    const { personaId: _id, ...patch } = input;
    const [updated] = await db
      .update(personaTable)
      .set(patch)
      .where(eq(personaTable.id, persona.id))
      .returning();
    return updated!;
  },
});

export const deletePersona = growthAction({
  outputSchema: deletePersonaOutputSchema,
  description:
    "Soft-delete a persona. Campaign audiences that pointed at it keep their lineage.",
  inputSchema: z.object({ personaId: z.string().trim().min(1) }),
  execute: async (input, ctx) => {
    const persona = await requirePersona(input.personaId, ctx.orgId);
    await db
      .update(personaTable)
      .set({ deletedAt: new Date() })
      .where(eq(personaTable.id, persona.id));
    return { deleted: true, id: persona.id };
  },
});

// ---- PERSONA AUDIENCES (the Meta assets a persona is bought through) --------

export const uploadPersonaSeedListAction = growthAction({
  outputSchema: uploadPersonaSeedListOutputSchema,
  description:
    "Create a Meta customer list for a persona and upload its members (plaintext email and/or phone; Zernio hashes server-side). The list becomes the persona's Meta asset, which every campaign audience derived from the persona targets. The ad account is the brand's allowlisted Meta destination unless one is named. Provider write, no spend; creation is NOT idempotent, so report a failure instead of retrying.",
  inputSchema: z.object({
    personaId: z.string().trim().min(1),
    users: z
      .array(
        z.object({
          email: z.string().email().optional(),
          phone: z.string().trim().min(5).optional(),
        }),
      )
      .min(1)
      .max(50_000),
    name: z.string().trim().min(1).max(255).optional(),
    adAccountId: z.string().trim().min(1).optional(),
  }),
  execute: async (input, ctx) =>
    uploadPersonaSeedList(input, {
      organizationId: ctx.orgId,
      runId: ctx.runId,
    }),
});

export const createPersonaLookalikeAction = growthAction({
  outputSchema: createPersonaLookalikeOutputSchema,
  description:
    "Build a Meta lookalike from a persona's seed list (a platform audience with a Meta id) and make it the persona's Meta asset, replacing the seed as what its campaigns target. Ratio defaults to 0.01 (closest 1%); country defaults to US; pass a country explicitly. Provider write, no spend; NOT idempotent.",
  inputSchema: z.object({
    seedPlatformAudienceId: z
      .string()
      .trim()
      .min(1)
      .describe("The paud_ row of the seed list."),
    personaId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Defaults to the persona the seed belongs to."),
    ratio: z.number().min(0.01).max(0.2).optional(),
    country: z.string().trim().length(2).optional(),
  }),
  execute: async (input, ctx) =>
    createPersonaLookalike(input, {
      organizationId: ctx.orgId,
      runId: ctx.runId,
    }),
});

export const assignPersonaAudienceAction = growthAction({
  outputSchema: assignPersonaAudienceOutputSchema,
  description:
    "Make an audience already in the ad account (synced or created earlier) the persona's asset on its platform, or pass personaId null to clear it. Replaces the persona's previous asset on that platform. Local rows only.",
  inputSchema: z.object({
    platformAudienceId: z.string().trim().min(1),
    personaId: z.string().trim().min(1).nullable(),
  }),
  execute: async (input, ctx) =>
    assignPersonaAudience({ ...input, organizationId: ctx.orgId }),
});

const suggestionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  profile: personaProfileSchema,
});

/** Read and reason separately from creation, so Shape can discuss the same proposals. */
export const suggestPersonas = growthAction({
  description:
    "Suggest up to three missing brand-level customer personas from the brand story and optional supplied evidence, preserving the existing set. Pass personaId to revise an existing persona and apply the result with update; omit it to propose missing personas. Pass steer for the requested changes. Read-only; return planning hypotheses, not measured booking facts. Discuss proposals in chat before applying them with personaWrite.create or personaWrite.update.",
  inputSchema: z.object({
    brandId: z.string().trim().min(1),
    steer: steerSchema,
    context: z
      .string()
      .trim()
      .max(30000)
      .optional()
      .describe(
        "Optional evidence from an explicit research or enrichment workflow.",
      ),
    personaId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Regenerate this existing persona as a proposal, preserving its identity. Apply with personaWrite.update; do not create a duplicate.",
      ),
  }),
  outputSchema: z.object({ suggestions: z.array(suggestionSchema).max(3) }),
  execute: async (input, ctx) => {
    await requireOwnedBrand(input.brandId, ctx.orgId);
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
  },
});

/** Industry-specific evidence is fetched only when this workflow is invoked. */
export const wanderOsResearchContext = growthAction({
  description:
    "On demand, read owned brand inventory and optionally aggregate booking evidence as prompt context. Never writes personas, audiences or targeting. Use this context explicitly with suggest when requested; general suggestion actions do not fetch it automatically.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    includeBookings: z.boolean().optional(),
  }),
  outputSchema: z.strictObject({ context: z.string() }),
  execute: async (input, ctx) => {
    await requireOwnedBrand(input.brandId, ctx.orgId);
    const homes = await db.query.homeTable.findMany({
      where: and(
        eq(homeTable.brandId, input.brandId),
        isNull(homeTable.deletedAt),
      ),
      columns: {
        name: true,
        city: true,
        state: true,
        bedrooms: true,
        guests: true,
        amenities: true,
      },
      limit: 100,
    });
    const bookings = input.includeBookings
      ? (JSON.parse(
          bookingDemandContext(await readBrandBookingDemand(input.brandId)),
        ) as unknown)
      : null;
    return {
      context: JSON.stringify({
        source: "Explicit WanderOS research",
        inventory: homes,
        bookings,
        guidance:
          "Inventory fit is a hypothesis. Booking evidence is aggregate and may be incomplete. Infer motivations and general campaign relevance, not automatic delivery targeting.",
      }).slice(0, 30000),
    };
  },
});
