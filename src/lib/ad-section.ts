import { z } from "zod";
import { textAdCopySchema } from "./ad-authoring";

export const adSectionSchema = z.object({
  adId: z.string().min(1),
  expectedUpdatedAt: z.string().datetime(),
  section: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("text"),
      copy: textAdCopySchema.omit({ linkUrl: true }),
    }),
    z.object({
      kind: z.literal("copy"),
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
