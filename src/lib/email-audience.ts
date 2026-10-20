import { z } from "zod";

/** Parameters are editable by chat; source SQL and tenant scope are owned by code. */
export const emailAudienceDefinitionSchema = z.object({
  source: z.enum(["wander_cio", "wanderos", "list"]),
  /** The uploaded list (email.list), for `source: "list"`. */
  listId: z.string().min(1).nullable().default(null),
  clickedWithinDays: z.number().int().min(1).max(730).nullable().default(90),
  guestKinds: z
    .array(z.enum(["bookers", "signups"]))
    .min(1)
    .default(["bookers", "signups"]),
  consentConfirmed: z.boolean().default(false),
  /** An optional sample limit; the sender reads current members in stable sample order. */
  sampleSize: z.number().int().min(1).max(1_000_000).nullable().default(null),
});
export type EmailAudienceDefinition = z.infer<
  typeof emailAudienceDefinitionSchema
>;
export const emailAudienceRecipientSchema = z.object({
  email: z.email(),
  first_name: z.string().nullable(),
  source_id: z.string(),
  reason: z.string(),
});
export type EmailAudienceRecipient = z.infer<
  typeof emailAudienceRecipientSchema
>;

export function assertEmailAudienceSource(
  definition: EmailAudienceDefinition,
  brand: { slug: string | null; websiteId: string | null },
) {
  if ((definition.source === "list") !== Boolean(definition.listId))
    throw new Error("Only uploaded-list audiences name a list.");
  if (definition.source === "list" && definition.clickedWithinDays !== null)
    throw new Error(
      "Click history is not available for uploaded lists. Choose no click filter.",
    );
  if (definition.source === "wander_cio" && brand.slug !== "wander")
    throw new Error(
      "Wander's Customer.io export is only available to the Wander brand.",
    );
  if (definition.source === "wanderos" && !brand.websiteId)
    throw new Error("This brand has no WanderOS website.");
  if (definition.source === "wanderos" && definition.clickedWithinDays !== null)
    throw new Error(
      "Click history is not available for WanderOS brands. Choose no click filter.",
    );
}

export function emailAudienceBlockers(definition: EmailAudienceDefinition) {
  return [
    ...(!definition.consentConfirmed
      ? ["Confirm this audience's marketing permission before sending."]
      : []),
    ...(definition.source === "wanderos"
      ? ["Live WanderOS opt-outs must be available before sending."]
      : []),
    "Postmark-managed streams enforce suppressions; custom streams require their own current opt-out handling.",
  ];
}

export function emailAudienceCsvRow(recipient: EmailAudienceRecipient) {
  return (
    [
      recipient.email,
      recipient.first_name ?? "",
      recipient.source_id,
      recipient.reason,
    ]
      .map((value) => {
        // Prevent formula execution when an operator opens the exported CSV.
        const safe = /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
        return `"${safe.replaceAll('"', '""')}"`;
      })
      .join(",") + "\r\n"
  );
}

/** Stable across PostgreSQL JSONB key ordering and unordered source selections. */
export function emailAudienceDefinitionKey(
  input: z.input<typeof emailAudienceDefinitionSchema>,
) {
  const definition = emailAudienceDefinitionSchema.parse(input);
  return JSON.stringify([
    definition.source,
    definition.listId,
    definition.clickedWithinDays,
    [...new Set(definition.guestKinds)].sort(),
    definition.consentConfirmed,
    definition.sampleSize,
  ]);
}
