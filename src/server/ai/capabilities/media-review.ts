import { z } from "zod";
import { growthAction } from "./types";
import {
  discoverMediaSuggestions,
  listMediaSuggestions,
  reviewMediaSuggestion,
} from "@/server/services/media-review.service";
const brandInput = z.object({ brandId: z.string().min(1) });
export const listMediaSuggestionsAction = growthAction({
  description:
    "Read unapproved website image suggestions for an owned brand. These external candidates cannot be used in a pitch or content until explicitly approved.",
  inputSchema: brandInput,
  outputSchema: z.array(
    z.object({
      id: z.string(),
      title: z.string().nullable(),
      thumbnailUrl: z.string().nullable(),
      sourceUrl: z.string().nullable(),
      sourcePage: z.string().nullable(),
    }),
  ),
  execute: (input, ctx) => listMediaSuggestions(ctx.orgId, input.brandId),
});
export const discoverMediaSuggestionsAction = growthAction({
  description:
    "Find initial photos from a brand's public website using Firecrawl, saving suggestions for review. Scrapes the homepage and up to two known same-site homes. Does not approve images or alter the pitch. Repeated discoveries preserve rejections and avoid duplicates.",
  inputSchema: brandInput,
  outputSchema: z.object({
    added: z.number(),
    pages: z.number(),
    failedPages: z.number(),
  }),
  execute: (input, ctx) => discoverMediaSuggestions(ctx.orgId, input.brandId),
});
export const reviewMediaSuggestionAction = growthAction({
  description:
    "Approve or reject one website image suggestion when the operator asks. Approval copies the file into the brand's hosted media library; rejection hides it from future discovery. Approval alone does not edit the pitch: use performanceWrite.savePitch to assign the returned hosted URL. Never approve candidates just because a scrape found them.",
  inputSchema: brandInput.extend({
    mediaId: z.string().min(1),
    decision: z.enum(["approve", "reject"]),
  }),
  outputSchema: z.object({
    id: z.string(),
    url: z.string().nullable(),
    reviewStatus: z.enum(["suggested", "approved", "rejected"]),
  }),
  execute: (input, ctx) => reviewMediaSuggestion(ctx.orgId, ctx.userId, input),
});
