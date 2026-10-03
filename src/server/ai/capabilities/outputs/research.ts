import { z } from "zod";
import { webPagePreviewSchema } from "@/lib/web-page-preview";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
export const webSearchOutputSchema = z.strictObject({
  note: z.string(),
  query: z.string(),
  results: z.array(
    z.strictObject({
      author: z.string().optional(),
      highlights: z.array(z.string()),
      publishedDate: z.string().optional(),
      title: z.string(),
      url: z.string(),
    }),
  ),
  untrustedContent: z.boolean(),
});

export const readWebPageOutputSchema = z.union([
  z.strictObject({
    author: z.string().optional(),
    note: z.string(),
    provider: z.literal("exa"),
    preview: webPagePreviewSchema.optional(),
    publishedDate: z.string().optional(),
    text: z.string(),
    title: z.string(),
    untrustedContent: z.boolean(),
    url: z.string(),
  }),
  z.strictObject({
    note: z.string(),
    provider: z.literal("firecrawl"),
    preview: webPagePreviewSchema.optional(),
    text: z.string(),
    title: z.string(),
    untrustedContent: z.boolean(),
    url: z.string(),
  }),
]);
