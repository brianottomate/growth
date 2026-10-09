import "server-only";

import { z } from "zod";

import { toSocialPostPreviewItem } from "@/lib/social-post-preview";
import { assertPostVisibleToOrganization } from "@/server/services/video-analysis.service";
import { growthTool } from "./types";

import { socialPostPreviewOutputSchema } from "@/lib/social-post-preview";
export { socialPostPreviewOutputSchema } from "@/lib/social-post-preview";

export const renderSocialPosts = growthTool({
  resultSchema: socialPostPreviewOutputSchema,
  description:
    "Render one to six exact social posts as platform-aware inline previews. Use after another Growth read returns platform post IDs and the operator asks to show, compare, or preview the proposed posts.",
  inputSchema: z.object({
    action: z.literal("render"),
    platformPostIds: z.array(z.string()).min(1).max(6),
  }),
  execute: async (
    { action, platformPostIds },
    ctx,
  ): Promise<z.output<typeof socialPostPreviewOutputSchema>> => {
    const uniqueIds = [...new Set(platformPostIds)];
    const posts = await Promise.all(
      uniqueIds.map((id) => assertPostVisibleToOrganization(id, ctx.orgId)),
    );
    return socialPostPreviewOutputSchema.parse({
      ok: true,
      action,
      data: { posts: posts.map(toSocialPostPreviewItem) },
    });
  },
});
