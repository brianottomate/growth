"use client";

import Link from "next/link";
import { socialPostPreviewOutputSchema } from "@/lib/social-post-preview";

export function SocialPostSummary({ result }: { result: unknown }) {
  const parsed = socialPostPreviewOutputSchema.safeParse(result);
  if (!parsed.success) return null;
  const posts = parsed.data.data.posts;
  return (
    <section
      aria-label="Social posts"
      className="rounded-xl border bg-card p-3"
    >
      <p className="mb-3 text-xs font-medium">
        {posts.length} social {posts.length === 1 ? "post" : "posts"}
      </p>
      <div className="space-y-3">
        {posts.map((post) => {
          const media = post.media[0];
          const thumbnail =
            media?.thumbnail || (media?.type !== "video" ? media?.url : null);
          return (
            <article key={post.id} className="flex min-w-0 items-start gap-3">
              {thumbnail && thumbnail.startsWith("https://") && (
                <img
                  src={thumbnail}
                  alt={`${post.brand.name} creative`}
                  className="size-12 shrink-0 rounded-lg object-cover"
                  loading="lazy"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">
                  {post.platform === "x" ? "X" : post.platform} ·{" "}
                  {post.status.replaceAll("_", " ")}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {post.text || "No caption yet"}
                </p>
                <Link
                  href={
                    post.href.startsWith("/app/") ? post.href : "/app/feed-v5"
                  }
                  className="mt-1 inline-block text-xs underline underline-offset-2"
                >
                  View post
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
