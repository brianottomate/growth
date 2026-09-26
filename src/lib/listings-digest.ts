import { z } from "zod";

/**
 * The property-digest email: region sections, each with one operated hero and
 * a couple of listed homes.
 *
 * This exists because the digest is not a markdown document. `bodyMarkdown` can
 * carry an editorial issue perfectly well, but a digest is a *table* — homes,
 * each with a location, a guest count, a nightly rate and a deep link — and
 * flattening that into prose loses exactly the structure the template needs to
 * lay out. So the digest travels as data on the same email document, and the
 * renderer dispatches on `templateKey`.
 *
 * The shape follows `emails/marketing/ListingsDigest.tsx`, which was modelled
 * on Customer.io newsletter 1551.
 *
 * This module is the schema only. Extraction lives in
 * `server/services/digest-extract.service.ts`, because it is a model call and
 * this file has to stay importable from the client.
 */

export const DIGEST_TEMPLATE_KEY = "listings-digest";

export const digestPropertySchema = z.object({
  /** "Wander Austin Grove" */
  name: z.string().trim().min(1).max(200),
  /** The city, when the source names one: "Austin". */
  city: z.string().trim().max(120).nullable().optional(),
  sleeps: z.number().int().positive().max(200).nullable().optional(),
  /** Nightly rate in whole dollars. 584 for "$584/nt". */
  nightlyUsd: z.number().int().nonnegative().nullable().optional(),
  /** A per-person figure when the source states one; never computed here. */
  perPersonUsd: z.number().int().nonnegative().nullable().optional(),
  /** Operated homes are the heroes; listed homes are supporting. */
  operated: z.boolean().default(false),
  href: z.string().trim().url().max(2_000).nullable().optional(),
  /** What the email draws: the hero rendered for email, badge baked in. */
  imageUrl: z.string().trim().url().max(2_000).nullable().optional(),

  // ---- From wander.com, once the home is matched to its listing ----------
  /** The Growth home (Wander brand) this entry is, once matched. */
  homeId: z.string().nullable().optional(),
  /** Full state or region name, as the listing gives it: "Utah". */
  state: z.string().trim().max(120).nullable().optional(),
  /** Guest rating out of 5, one decimal, as the card prints it; null = New. */
  rating: z.number().min(0).max(5).nullable().optional(),
  /** Badged tiers only; a STANDARD home carries no pill. */
  tier: z.enum(["LUXURY", "ICONIC"]).nullable().optional(),
  /**
   * The cheapest stay wander.com advertises, as the card prints it: the
   * all-in total in whole dollars ("$1,037 for 3 nights").
   */
  stay: z
    .object({
      totalUsd: z.number().int().nonnegative(),
      nights: z.number().int().positive(),
      checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .nullable()
    .optional(),
  /** wander.com's "~$X less than other sites" for that stay. 0 = no line. */
  savingsUsd: z.number().int().nonnegative().nullable().optional(),
  /** The issue has stay dates and this home cannot be booked for them. */
  stayUnavailable: z.boolean().nullable().optional(),
  /** The listing photo `imageUrl` was rendered from. */
  heroUrl: z.string().trim().url().max(2_000).nullable().optional(),
  /**
   * Listings that fit the name equally well, when matching could not choose.
   * Cleared once one is picked.
   */
  candidates: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        url: z.string().url(),
        city: z.string().nullable(),
        thumbUrl: z.string().url().nullable(),
      }),
    )
    .max(8)
    .nullable()
    .optional(),
});

export type DigestProperty = z.infer<typeof digestPropertySchema>;

export const digestSectionSchema = z.object({
  /** "AUSTIN + HILL COUNTRY, TX" */
  heading: z.string().trim().min(1).max(200),
  properties: z.array(digestPropertySchema).min(1).max(12),
  /**
   * The wander.com search for the section's place, for its "Explore" button:
   * the site's own suggestion for the place, so the link carries the map
   * bounds the search page needs.
   */
  explore: z
    .object({
      href: z.string().url().max(2_000),
      /** "Park City", as the button names it. */
      place: z.string().trim().min(1).max(120),
    })
    .nullable()
    .optional(),
});

export type DigestSection = z.infer<typeof digestSectionSchema>;

/**
 * What a paste can state about a home, and so all a model transcribing one is
 * offered. Everything matched from wander.com is written by code, never by
 * the model reading the paste.
 */
export const digestTranscribedSectionSchema = digestSectionSchema
  .omit({
    explore: true,
  })
  .extend({
    properties: z
      .array(
        digestPropertySchema.pick({
          name: true,
          city: true,
          sleeps: true,
          nightlyUsd: true,
          perPersonUsd: true,
          operated: true,
          href: true,
          imageUrl: true,
        }),
      )
      .min(1)
      .max(12),
  });

export const listingsDigestSchema = z.object({
  schema: z.literal("wander-growth.listings-digest.v1"),
  /** The editorial angle, when the source states one. */
  theme: z.string().trim().max(200).nullable().optional(),
  /** Why this send, when the source states it. */
  rationale: z.string().trim().max(1_000).nullable().optional(),
  sections: z.array(digestSectionSchema).min(1).max(10),
  /**
   * The stay every home is quoted for ("October 16-19"), when the issue has
   * one. Without it each home shows the cheapest stay wander.com caches for
   * it, which can be any dates and any length.
   */
  stayWindow: z
    .object({
      checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .nullable()
    .optional(),
});

export type ListingsDigest = z.infer<typeof listingsDigestSchema>;

/** "October 12-15", or "October 30-November 2" across a month. */
function stayDates(checkIn: string, checkOut: string) {
  const format = (value: string, options: Intl.DateTimeFormatOptions) =>
    new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
      timeZone: "UTC",
      ...options,
    });
  const sameMonth = checkIn.slice(0, 7) === checkOut.slice(0, 7);
  return `${format(checkIn, { month: "long", day: "numeric" })}-${format(
    checkOut,
    sameMonth ? { day: "numeric" } : { month: "long", day: "numeric" },
  )}`;
}

/** "$1,037 for 3 nights (November 13-16)", as the issue prints it. */
export function stayLabel(stay: NonNullable<DigestProperty["stay"]>) {
  return `$${stay.totalUsd.toLocaleString("en-US")} for ${stay.nights} night${stay.nights === 1 ? "" : "s"} (${stayDates(stay.checkIn, stay.checkOut)})`;
}

/** "Save ~$90 booking on Wander" on a featured card, "Save ~$90" in a list. */
export function savingsLabel(savingsUsd: number, featured: boolean) {
  const amount = `Save ~$${savingsUsd.toLocaleString("en-US")}`;
  return featured ? `${amount} booking on Wander` : amount;
}
