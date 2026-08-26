export type SocialPostPreviewSource = {
  id: string;
  platform: string;
  format: string | null;
  status: string;
  text: string | null;
  firstComment?: string | null;
  firstCommentText?: string | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  externalUrl: string | null;
  media: Array<{
    url: string;
    type: "image" | "video" | "carousel";
    thumbnail?: string;
  }> | null;
  brand: { name: string; logo: string | null } | null;
  channel: {
    displayName: string | null;
    handle: string | null;
  } | null;
  username: string | null;
};

export type SocialPostPreviewItem = ReturnType<typeof toSocialPostPreviewItem>;

export function toSocialPostPreviewItem(post: SocialPostPreviewSource) {
  return {
    id: post.id,
    platform: post.platform,
    format: post.format,
    status: post.status,
    text: post.text ?? "",
    firstComment: post.firstComment ?? post.firstCommentText ?? null,
    scheduledAt: post.scheduledAt?.toISOString() ?? null,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    externalUrl: post.externalUrl,
    href: `/app/feed-v5?post=${encodeURIComponent(post.id)}`,
    brand: {
      name: post.brand?.name ?? "Unknown brand",
      logo: post.brand?.logo ?? null,
    },
    channel: {
      displayName: post.channel?.displayName ?? null,
      handle: post.channel?.handle ?? post.username,
    },
    media: (post.media ?? []).slice(0, 10).map((item) => ({
      type: item.type,
      url: item.url,
      thumbnail: item.thumbnail ?? null,
    })),
  };
}
