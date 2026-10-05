import { z } from "zod";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
export const recentMentionsOutputSchema = z.strictObject({
  count: z.number(),
  mentions: z.array(
    z.strictObject({
      author: z.string().nullable(),
      id: z.string(),
      intentTag: z.string().nullable(),
      keyword: z.string().nullable(),
      receivedAt: z.iso.datetime(),
      relevance: z.number().nullable(),
      source: z.enum([
        "other",
        "instagram",
        "reddit",
        "hackernews",
        "lobsters",
        "twitter",
      ]),
      status: z.enum(["new", "skipped", "engaged"]),
      subreddit: z.string().nullable(),
      suggestedAction: z.string().nullable(),
      title: z.string().nullable(),
      url: z.string(),
    }),
  ),
});

/** Native service result; the existing wire contract validates its JSON projection. */
export const recentMentionsNativeResultSchema =
  recentMentionsOutputSchema.extend({
    mentions: z.array(
      recentMentionsOutputSchema.shape.mentions.element.extend({
        receivedAt: z.date(),
      }),
    ),
  });
