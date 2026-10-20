import { z } from "zod";

export const partnershipSaveInput = z
  .object({
    id: z.string().min(1).optional(),
    amplifierId: z.string().min(1).optional(),
    brandId: z.string().min(1).optional(),
    homeId: z.string().min(1).nullable().optional(),
    checkIn: z.iso.date().nullable().optional(),
    checkOut: z.iso.date().nullable().optional(),
    deliverables: z.string().trim().max(4000).nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.id && (!value.amplifierId || !value.brandId))
      ctx.addIssue({
        code: "custom",
        message: "Choose an amplifier and a client.",
      });
  });
export const partnershipListInput = z.object({
  brandId: z.string().optional(),
  amplifierId: z.string().optional(),
});
export const partnershipIdInput = z.object({ id: z.string().min(1) });
export const partnershipOutput = z.object({
  id: z.string(),
  amplifierId: z.string(),
  amplifierName: z.string(),
  brandId: z.string(),
  brandName: z.string(),
  homeId: z.string().nullable(),
  homeName: z.string().nullable(),
  checkIn: z.string().nullable(),
  checkOut: z.string().nullable(),
  deliverables: z.string().nullable(),
  notes: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  linkIssue: z.string().nullable(),
});

/** The partnership ID is the attribution identity. Display names can change. */
export function influencerTrackingUrl(
  destination: string,
  partnershipId: string,
) {
  const url = new URL(destination);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Choose a valid HTTP booking destination.");
  // Inventory URLs are canonical listing paths; cached search dates, guests,
  // search IDs and previous attribution must not leak into a creator's brief.
  url.search = "";
  url.hash = "";
  url.searchParams.set("utm_source", "influencer");
  url.searchParams.set("utm_medium", "partnership");
  url.searchParams.set("utm_campaign", "wander_performance");
  url.searchParams.set("utm_id", partnershipId);
  return url.toString();
}
