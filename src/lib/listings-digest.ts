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
  imageUrl: z.string().trim().url().max(2_000).nullable().optional(),
});

export type DigestProperty = z.infer<typeof digestPropertySchema>;

export const digestSectionSchema = z.object({
  /** "AUSTIN + HILL COUNTRY, TX" */
  heading: z.string().trim().min(1).max(200),
  properties: z.array(digestPropertySchema).min(1).max(12),
});

export type DigestSection = z.infer<typeof digestSectionSchema>;

export const listingsDigestSchema = z.object({
  schema: z.literal("wander-growth.listings-digest.v1"),
  /** The editorial angle, when the source states one. */
  theme: z.string().trim().max(200).nullable().optional(),
  /** Why this send, when the source states it. */
  rationale: z.string().trim().max(1_000).nullable().optional(),
  sections: z.array(digestSectionSchema).min(1).max(10),
});

export type ListingsDigest = z.infer<typeof listingsDigestSchema>;
