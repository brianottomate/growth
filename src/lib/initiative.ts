import { z } from "zod";
export const initiativeStatusSchema = z.enum([
  "planned",
  "active",
  "paused",
  "completed",
  "archived",
]);
export const initiativeTargetSchema = z
  .object({
    contentPostId: z.string().min(1).optional(),
    seriesId: z.string().min(1).optional(),
    campaignId: z.string().min(1).optional(),
  })
  .refine(
    (v) =>
      [v.contentPostId, v.seriesId, v.campaignId].filter(Boolean).length === 1,
    "Choose exactly one content post, series, or campaign.",
  );
export function initiativeIncludesPost(
  post: { id: string; seriesId: string | null },
  members: { contentPostId: string | null; seriesId: string | null }[],
) {
  return members.some(
    (m) =>
      m.contentPostId === post.id ||
      (post.seriesId !== null && m.seriesId === post.seriesId),
  );
}
