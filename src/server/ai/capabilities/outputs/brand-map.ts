import { z } from "zod";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
export const getBrandMapOutputSchema = z.strictObject({
  brands: z.array(
    z.strictObject({
      id: z.string(),
      name: z.string(),
      slug: z.string().nullable(),
      surfaces: z.strictObject({
        blogPosts: z.number(),
        channels: z.number(),
        contentIdeas: z.number(),
        hasStrategyTargets: z.boolean(),
        mediaAssets: z.number(),
        peers: z.number(),
        pendingReviews: z.number(),
        personas: z.number(),
        series: z.number(),
        webPages: z.number(),
      }),
      type: z.enum(["company", "personal"]),
      url: z.string(),
    }),
  ),
  guidance: z.string(),
  reviewUrl: z.string(),
});
