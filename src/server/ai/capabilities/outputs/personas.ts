import { z } from "zod";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
const demandGeographySchema = z.strictObject({
  cities: z.array(z.string()).optional(),
  countries: z.array(z.string()).optional(),
  regions: z.array(z.string()).optional(),
  source: z.string().nullable().optional(),
  states: z.array(z.string()).optional(),
});

const listPersonaItemSchema = z.strictObject({
  ageRanges: z.array(z.string()).nullable(),
  brandId: z.string(),
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
  demandGeography: demandGeographySchema.nullable(),
  description: z.string().nullable(),
  geographies: z.array(z.string()).nullable(),
  id: z.string(),
  name: z.string(),
  notes: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});

export const listPersonasOutputSchema = z.array(listPersonaItemSchema);

export const createPersonaOutputSchema = listPersonaItemSchema;

export const updatePersonaOutputSchema = listPersonaItemSchema;

export const deletePersonaOutputSchema = z.strictObject({
  deleted: z.boolean(),
  id: z.string(),
});
