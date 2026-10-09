import { z } from "zod";

/** Campaign intent, independent of provider-specific demographic controls. */
export const audienceAgeSchema = z
  .object({
    ageMin: z.number().int().min(0).max(120).nullable().optional(),
    ageMax: z.number().int().min(0).max(120).nullable().optional(),
  })
  .refine(
    (age) =>
      age.ageMin == null || age.ageMax == null || age.ageMin <= age.ageMax,
    "Minimum age exceeds maximum age",
  );

export function audienceAgeLabel(age: {
  ageMin?: number | null;
  ageMax?: number | null;
}) {
  if (age.ageMin != null && age.ageMax != null)
    return `${age.ageMin}–${age.ageMax}`;
  if (age.ageMin != null) return `${age.ageMin}+`;
  if (age.ageMax != null) return `Up to ${age.ageMax}`;
  return "Not specified";
}
