import { z } from "zod";

/** Exact saved field values can be structured settings; they are data, never executable instructions. */
export const appliedEvidenceSchema = z.object({
  evidence: z.array(
    z.object({
      sourceType: z.enum(["website", "intake", "operator"]),
      sourceId: z.string(),
      sourceUrl: z.string().nullable(),
      observedAt: z.iso.datetime(),
      method: z.enum([
        "website-extraction",
        "client-submission",
        "operator-override",
      ]),
    }),
  ),
  applied: z.array(
    z.object({
      targetType: z.enum(["brand", "account", "cycle", "property"]),
      targetId: z.string(),
      field: z.string(),
      value: z.json(),
    }),
  ),
});
export type AppliedEvidence = z.infer<typeof appliedEvidenceSchema>;
