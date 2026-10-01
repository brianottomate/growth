import { z } from "zod";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Use a valid calendar date.");
export const bookingTargetInputSchema = z
  .object({
    brandId: z.string().min(1),
    name: z.string().trim().min(1).max(120),
    homeGroupId: z.string().min(1).nullable().optional(),
    homeId: z.string().min(1).nullable().optional(),
    checkIn: date.nullable().optional(),
    checkOut: date.nullable().optional(),
    guests: z.number().int().min(1).max(100).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.homeId && value.homeGroupId)
      ctx.addIssue({
        code: "custom",
        message: "Choose a home or a group, not both.",
      });
    if (Boolean(value.checkIn) !== Boolean(value.checkOut))
      ctx.addIssue({ code: "custom", message: "Provide both stay dates." });
    if (value.checkIn && value.checkOut && value.checkOut <= value.checkIn)
      ctx.addIssue({
        code: "custom",
        message: "Check-out must follow check-in.",
      });
  });
export type BookingTargetInput = z.infer<typeof bookingTargetInputSchema>;

/** Uses the storefront's unit IDs, never Growth home IDs or a copied search_id. */
export function bookingTargetUrl(input: {
  website: string;
  homeUrl?: string;
  unitIds?: string[];
  checkIn?: string | null;
  checkOut?: string | null;
  guests?: number | null;
}) {
  const website = new URL(input.website);
  if (!["https:", "http:"].includes(website.protocol))
    throw new Error("Use an HTTP booking website.");
  const url = input.homeUrl
    ? new URL(input.homeUrl, website)
    : new URL("/s", website);
  if (url.origin !== website.origin)
    throw new Error("The home must link to this brand's booking site.");
  for (const key of ["search_id", "unitIds", "checkin", "checkout", "guests"])
    url.searchParams.delete(key);
  if (input.unitIds?.length)
    url.searchParams.set(
      "unitIds",
      [...new Set(input.unitIds)].sort().join(","),
    );
  if (input.checkIn) url.searchParams.set("checkin", input.checkIn);
  if (input.checkOut) url.searchParams.set("checkout", input.checkOut);
  if (input.guests) url.searchParams.set("guests", String(input.guests));
  return url.toString();
}
