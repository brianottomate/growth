import { z } from "zod";
import { personaProfileSchema } from "@/lib/brand-direction";

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
  destinationGeography: demandGeographySchema.nullable(),
  description: z.string().nullable(),
  geographies: z.array(z.string()).nullable(),
  id: z.string(),
  name: z.string(),
  notes: z.string().nullable(),
  profile: personaProfileSchema.nullable(),
  updatedAt: z.iso.datetime(),
});

export const listPersonasOutputSchema = z.array(listPersonaItemSchema);

export const createPersonaOutputSchema = listPersonaItemSchema;

export const updatePersonaOutputSchema = listPersonaItemSchema;

export const deletePersonaOutputSchema = z.strictObject({
  deleted: z.boolean(),
  id: z.string(),
});

export const uploadPersonaSeedListOutputSchema = z.strictObject({
  adAccountId: z.string(),
  platformAudienceId: z.string(),
  total: z.number(),
  uploaded: z.number(),
});

export const createPersonaLookalikeOutputSchema = z.strictObject({
  adAccountId: z.string(),
  country: z.string(),
  platformAudienceId: z.string().nullable(),
  ratio: z.number(),
});

export const assignPersonaAudienceOutputSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  personaId: z.string().nullable(),
});

/** Native service result; the existing wire contract validates its JSON projection. */
export const listPersonasNativeResultSchema = z.array(
  listPersonasOutputSchema.element.extend({
    createdAt: z.date(),
    deletedAt: z.date().nullable(),
    updatedAt: z.date(),
  }),
);

/** Native service result; the existing wire contract validates its JSON projection. */
export const createPersonaNativeResultSchema = createPersonaOutputSchema.extend(
  {
    createdAt: z.date(),
    deletedAt: z.date().nullable(),
    updatedAt: z.date(),
  },
);

/** Native service result; the existing wire contract validates its JSON projection. */
export const updatePersonaNativeResultSchema = createPersonaNativeResultSchema;
