import {
  listPersonasOutputSchema,
  createPersonaOutputSchema,
  updatePersonaOutputSchema,
  deletePersonaOutputSchema,
  uploadPersonaSeedListOutputSchema,
  createPersonaLookalikeOutputSchema,
  assignPersonaAudienceOutputSchema,
} from "./outputs/personas";
import "server-only";

import { z } from "zod";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, personaTable } from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { demandGeographySchema } from "@/lib/persona-geography";
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
    where: eq(personaTable.id, personaId),
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
  demandGeography: demandGeographySchema
    .nullish()
    .describe(
      "The demand side, structured: where the guests we want come FROM. This is the reusable source a campaign audience derives from; supply geography (where the homes are) is not this. Fill it from your own reasoning or a blob looked up elsewhere and note the `source`.",
    ),
  notes: z.string().trim().max(4000).nullish(),
};

export const listPersonas = growthAction({
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
  outputSchema: createPersonaOutputSchema,
  description:
    "Create a persona under an owned brand. Personas are few and stable — check the existing list before adding one; a geography or age variant of an existing persona is a campaign audience, not a new persona.",
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
        demandGeography: input.demandGeography ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    return persona!;
  },
});

export const updatePersona = growthAction({
  outputSchema: updatePersonaOutputSchema,
  description:
    "Update a persona's fields. Only the fields sent are changed; null clears one.",
  inputSchema: z.object({
    personaId: z.string().trim().min(1),
    name: personaFields.name.optional(),
    description: personaFields.description,
    ageRanges: personaFields.ageRanges,
    geographies: personaFields.geographies,
    demandGeography: personaFields.demandGeography,
    notes: personaFields.notes,
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
    "Build a Meta lookalike from a persona's seed list (a platform audience with a Meta id) and make it the persona's Meta asset, replacing the seed as what its campaigns target. Ratio defaults to 0.01 (closest 1%); country defaults to the persona's first demand country, then US. Provider write, no spend; NOT idempotent.",
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
