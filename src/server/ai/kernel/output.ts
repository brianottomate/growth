import { z } from "zod";

/** Only provider extension fields and intentionally open stored metadata use this.
 * Product records and action results must describe their own named fields. */
export const jsonValueSchema = z
  .json()
  .describe(
    "JSON extension data owned by the provider or stored metadata; surrounding product fields have explicit contracts.",
  );

export const capabilityErrorSchema = z.object({
  ok: z.literal(false),
  action: z.string().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    suggestedAction: z.string(),
    issues: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional(),
  }),
});

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Serialize once at the receipt/transport boundary, using standard JSON semantics. */
export function normalizeGrowthJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
