import { z } from "zod";

export const EMAIL_PROGRAM_KEYS = [
  "newsletter",
  "offers",
  "sequences",
] as const;

/**
 * What a client sent from the intake's email section, after the brand
 * section. Lives in the brand's Performance settings; a later send replaces
 * it (last write wins), and it is not part of the intake receipt.
 * `discountCapDollars: null` is "ask me before every offer"; a number is the
 * most we may take off a stay without asking.
 */
export const intakeEmailPreferencesSchema = z.strictObject({
  programs: z.array(z.enum(EMAIL_PROGRAM_KEYS)).max(EMAIL_PROGRAM_KEYS.length),
  discountCapDollars: z.number().int().min(1).max(100_000).nullable(),
  currentTool: z.string().trim().max(100).nullable(),
});

export type IntakeEmailPreferences = z.infer<
  typeof intakeEmailPreferencesSchema
>;
