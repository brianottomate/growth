import { z } from "zod";
import { textAdCopySchema } from "./ad-authoring";

export const adSectionSchema = z.object({
  adId: z.string().min(1),
  section: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("text"),
      name: z.string().trim().min(1).max(200),
      copy: textAdCopySchema.omit({ linkUrl: true }),
    }),
    z.object({
      kind: z.literal("copy"),
      name: z.string().trim().min(1).max(200),
      headline: z.string().max(60),
      body: z.string().max(1200),
      description: z.string().max(120),
    }),
    z.object({
      kind: z.literal("destination"),
      linkUrl: z.union([z.string().url(), z.literal("")]),
      callToAction: z.string().max(64).optional(),
      bookingTargetId: z.string().min(1).nullable(),
    }),
    z.object({
      kind: z.literal("video"),
      baseAssetId: z.string().min(1).nullable().optional(),
      storyAssetId: z.string().min(1).nullable().optional(),
    }),
  ]),
});
