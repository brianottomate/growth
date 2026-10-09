import { z } from "zod";
import { EMAIL_RECIPES } from "./email-recipes";

// Newsletter templates: a fixed structure the email always has, the brand's
// homes picked for it by AI (from their photos and booking evidence), and the
// copy written around those homes in the same call. The operator gives the
// angle; everything after is an ordinary draft in the block editor.

export const NEWSLETTER_TEMPLATES = [
  {
    id: "season-ahead",
    category: "Property emails",
    layout: "feature-list",
    requiredContext: [] as readonly string[],
    source: null,
    label: "Season ahead",
    summary: "A getaway for the season coming up",
    structure: [
      "Header card",
      "Intro",
      "1 featured home",
      "While you're there",
      "3 more homes",
      "Offer",
      "Button",
    ],
    angleLabel: "Season or occasion",
    anglePlaceholder: "Fall foliage, ski season, Thanksgiving week",
    homes: 4,
  },
  {
    id: "home-collection",
    category: "Property emails",
    layout: "grid",
    requiredContext: [] as readonly string[],
    source: null,
    label: "Home collection",
    summary: "Four homes that share one thing guests want",
    structure: [
      "Header card",
      "Intro",
      "4 homes in a grid",
      "Closing line",
      "Offer",
      "Button",
    ],
    angleLabel: "What they share",
    anglePlaceholder: "Hot tubs, big groups, pet friendly",
    homes: 4,
  },
  ...EMAIL_RECIPES,
] as const;

export type NewsletterTemplateId = (typeof NEWSLETTER_TEMPLATES)[number]["id"];

export const newsletterTemplateIds = NEWSLETTER_TEMPLATES.map(
  (template) => template.id,
) as [NewsletterTemplateId, ...NewsletterTemplateId[]];

export function newsletterTemplate(id: NewsletterTemplateId) {
  return NEWSLETTER_TEMPLATES.find((template) => template.id === id)!;
}

export const draftFromTemplateInputSchema = z.object({
  seriesId: z
    .string()
    .optional()
    .describe(
      "Recurring newsletter series for a new edition; must belong to this brand.",
    ),
  platformPostId: z
    .string()
    .optional()
    .describe(
      "Existing email slot to fill. Pass this for a full email requested on an existing slot; do not create a duplicate.",
    ),
  brief: z
    .string()
    .trim()
    .max(10000)
    .optional()
    .describe(
      "The full operator brief, including home inclusions/exclusions, group sizes, copy and visual direction. Use verified catalog facts; do not invent prices or availability.",
    ),
  brandId: z.string().describe("The brand to draft for (id from listBrands)."),
  template: z
    .enum(newsletterTemplateIds)
    .describe(
      "Choose from the reusable recipe library. season-ahead and home-collection are property layouts; brian-* recipes cover Booking, During the stay, After the stay, Blasts and Holidays. Use listTemplates first for exact IDs, required facts and intended triggers.",
    ),
  verifiedContext: z
    .record(z.string().max(80), z.string().trim().min(1).max(10000))
    .optional()
    .describe(
      "Verified facts keyed by the recipe requiredContext fields returned by listTemplates. Facts belong to this brand/guest; never copy demo facts. Keys ending in Url must contain a real https URL.",
    ),
  homeIds: z
    .array(z.string())
    .max(16)
    .optional()
    .describe(
      "Restrict picks to these homes from this brand. Use for viewed, saved, checkout or newly listed homes.",
    ),
  angle: z
    .string()
    .trim()
    .max(120)
    .optional()
    .describe(
      "The season/occasion (season-ahead) or the shared trait (home-collection). Omit to let the brand's markets and amenities decide.",
    ),
  offer: z
    .string()
    .trim()
    .max(200)
    .optional()
    .describe(
      "An offer the brand has actually approved, with its code, exactly as it should read. Omit when there is none; the email then has no offer.",
    ),
  plannedAt: z
    .string()
    .datetime()
    .optional()
    .describe("Growth content-calendar time for the send."),
});

export type DraftFromTemplateInput = z.infer<
  typeof draftFromTemplateInputSchema
>;

/**
 * Amenities guests choose a home for, which make a collection. Everything
 * else on a listing (Kitchen, Wifi, Hair dryer) is a given, not a theme.
 */
export const COLLECTION_AMENITIES = [
  "Hot tub",
  "Sauna",
  "Game Room",
  "Pool table",
  "Game console",
  "Heated pool",
  "Pool outdoor",
  "Private pool",
  "Waterfront",
  "Lake Access",
  "Beach access",
  "Ski-in/Ski-out",
  "Fire pit",
  "Mountain view",
  "Ocean view",
  "Gym",
  "Pet friendly",
  "EV Charger",
  "Private Chef",
] as const;

/** Group sizes a collection can be about, by how many a home sleeps. */
export const GROUP_COLLECTIONS = [
  { label: "Big groups, sleeps 12+", min: 12, max: Infinity },
  { label: "Cozy for two to four", min: 1, max: 4 },
] as const;

/** US occasions by month (0-based), for the months ahead of a send. */
const OCCASIONS: Record<number, string[]> = {
  0: ["Winter getaways", "MLK weekend"],
  1: ["Valentine's Day", "Presidents' Day weekend"],
  2: ["Spring break"],
  3: ["Spring escapes", "Easter"],
  4: ["Memorial Day weekend"],
  5: ["Summer vacation"],
  6: ["Fourth of July"],
  7: ["Late summer"],
  8: ["Labor Day weekend", "Fall getaways"],
  9: ["Fall foliage", "Halloween"],
  10: ["Thanksgiving week"],
  11: ["Christmas and New Year's"],
};

/** The occasions in the three months from a date, nearest first. */
export function upcomingOccasions(from: Date) {
  return [0, 1, 2].flatMap(
    (offset) => OCCASIONS[(from.getMonth() + offset) % 12] ?? [],
  );
}

/** Human labels for the structured facts used by the AI tool. */
export const RECIPE_CONTEXT_LABELS: Record<string, string> = {
  booking: "Reservation details",
  receipt: "Payment and line items",
  tripUrl: "Manage booking link",
  reviews: "Verified guest reviews",
  viewedHome: "Home the guest viewed",
  search: "Search details",
  checkout: "Checkout details",
  completedStay: "Completed stay details",
  arrival: "Arrival instructions",
  access: "Access and parking instructions",
  support: "Guest support details",
  extension: "Approved extension terms",
  inviteUrl: "Guest invitation link",
  surveyUrl: "Guest survey link",
  reviewUrl: "Leave a review link",
  cancellation: "Cancellation details",
  lastStay: "Previous stay details",
  loyalty: "Loyalty benefits",
  savedHome: "Home the guest saved",
  priceChange: "Verified price change",
  availability: "Verified open dates",
  referral: "Referral terms",
  referralUrl: "Referral link",
  offerPolicy: "Offer rules",
  offerUrl: "Submit an offer link",
  credits: "Credit balance and terms",
  creditsUrl: "Use credits link",
  birthday: "Birthday details",
  newHome: "New home announcement",
  launch: "Site launch details",
  bookingRanking: "Verified booking ranking",
  upgrade: "Completed amenity upgrade",
  importPermission: "Imported guest permission",
  event: "Local event facts",
  brandNews: "Brand news",
};
