import { z } from "zod";

/**
 * A persona's structured demand geography: where the guests we want come FROM.
 * The reusable, brand-level source a campaign audience derives from. Kept in
 * one place so the oRPC router, the AI capability, and the editor agree on the
 * shape. Mirrors a campaign audience's geography on purpose.
 */
export const demandGeographySchema = z.object({
  countries: z
    .array(z.string().trim().length(2))
    .max(20)
    .optional()
    .describe('ISO country codes, e.g. ["US"].'),
  states: z
    .array(z.string().trim().length(2))
    .max(60)
    .optional()
    .describe('Two-letter state codes, e.g. ["CA", "TX"].'),
  regions: z
    .array(z.string().trim().min(1).max(100))
    .max(60)
    .optional()
    .describe('State/region names, e.g. ["California"], for geo search.'),
  cities: z
    .array(z.string().trim().min(1).max(120))
    .max(200)
    .optional()
    .describe('City names, e.g. ["Los Angeles", "Dallas"].'),
  source: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .describe("Where this came from: a note, a system name, a date."),
});
