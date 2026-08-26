import "server-only";

import { z } from "zod";

import { toSocialPostPreviewItem } from "@/lib/social-post-preview";
import { assertPostVisibleToOrganization } from "@/server/services/video-analysis.service";
import { growthTool } from "./types";

const previewMediaSchema = z.object({
  type: z.enum(["image", "video", "carousel"]),
  url: z.string(),
  thumbnail: z.string().nullable(),
});

const previewPostSchema = z.object({
  id: z.string(),
  platform: z.string(),
  format: z.string().nullable(),
  status: z.string(),
  text: z.string(),
  firstComment: z.string().nullable(),
  scheduledAt: z.string().nullable(),
  publishedAt: z.string().nullable(),
  externalUrl: z.string().nullable(),
  href: z.string(),
  brand: z.object({ name: z.string(), logo: z.string().nullable() }),
  channel: z.object({
    displayName: z.string().nullable(),
    handle: z.string().nullable(),
  }),
  media: z.array(previewMediaSchema),
});

export const socialPostPreviewOutputSchema = z.object({
  ok: z.literal(true),
  action: z.literal("render"),
  data: z.object({ posts: z.array(previewPostSchema).min(1).max(6) }),
});

export const renderSocialPosts = growthTool({
  description:
    "Render one to six exact social posts as platform-aware inline previews. Use after another Growth read returns platform post IDs and the operator asks to show, compare, or preview the proposed posts.",
  inputSchema: z.object({
    action: z.literal("render"),
    platformPostIds: z.array(z.string()).min(1).max(6),
  }),
  execute: async ({ action, platformPostIds }, ctx) => {
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
