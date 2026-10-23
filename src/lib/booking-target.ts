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

/** The dated stay a booking target sells, as ad generation sees it. */
export type BookingStay = {
  name: string;
  checkIn: string;
  checkOut: string;
  guests?: number | null;
};

function stayDay(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "Fri, Oct 30 to Sun, Nov 1" */
export function stayDates(stay: Pick<BookingStay, "checkIn" | "checkOut">) {
  return `${stayDay(stay.checkIn)} to ${stayDay(stay.checkOut)}`;
}

/**
 * Turns evergreen ad copy into copy for one dated stay. Availability is a
 * supplied fact here: the homes were open on the booking site for these
 * dates, and the ad's link opens the site with them selected.
 */
export function datedStaySection(stay?: BookingStay | null) {
  if (!stay) return "";
  return `\n\n## Dated stay\nThese ads sell one specific stay, not an evergreen visit: "${stay.name}", check-in ${stayDates(stay)} (${stay.checkIn} to ${stay.checkOut})${stay.guests ? `, for ${stay.guests} guests` : ""}. The ad's link opens the booking site with these dates selected, and the homes advertised were open for them when the ads were made. Make the occasion and the dates unmistakable: the primary text must name the occasion and give the dates, the headline names the occasion, and the opening card's titles (feed and Story; the opener is also the static ad) lead with the occasion rather than a place or amenity, because that image is what people see first. Saying a home is open or available for these dates is allowed; claiming scarcity, counts of homes left, discounts, prices or deadlines is not. Check every feature against the stay dates: leave out anything the supplied facts say is seasonal or closed then (a pool open Memorial Day to Labor Day is closed on an October stay), and never call a shared or resort amenity private. Choose photos the same way: prefer ones that look like the season of the stay (interiors, fireplaces, hot tubs, autumn or neutral exteriors), and never open on a photo whose main subject is closed or out of season then. Do not invent events, activities, decorations or local happenings for the occasion; seasonal mood is fine only where the photographs or supplied facts show it. Write for people who live within a short drive, choosing to make the occasion a getaway.`;
}
