import { z } from "zod";

export const adAuthoringFields = {
  campaignId: z.string().trim().min(1).optional(),
  brandId: z.string().trim().min(1).optional(),
};
export function hasOneAdOwner(input: {
  campaignId?: string;
  brandId?: string;
}) {
  return Boolean(input.campaignId) !== Boolean(input.brandId);
}
export const adAuthoringScopeSchema = z
  .object(adAuthoringFields)
  .refine(hasOneAdOwner, {
    message: "Supply either campaignId or brandId.",
  });

/** Search-compatible copy; a draft may have fewer assets than delivery requires. */
export const textAdCopySchema = z.object({
  headlines: z.array(z.string().trim().min(1).max(30)).min(1).max(15),
  descriptions: z.array(z.string().trim().min(1).max(90)).min(1).max(4),
  linkUrl: z.string().url().optional(),
});
export function textAdReady(copy: z.infer<typeof textAdCopySchema>) {
  return (
    textAdCopySchema.safeParse(copy).success &&
    copy.headlines.length >= 3 &&
    copy.descriptions.length >= 2
  );
}

/** Rebuilding a creative set must preserve text drafts and reviewed work. */
export function isReplaceableStudioAd(ad: { status: string; type: string }) {
  return ad.status !== "approved" && ad.type === "creative";
}
