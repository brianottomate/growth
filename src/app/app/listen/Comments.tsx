import { isZernioConfigured } from "@/server/clients/zernio.client";

import { CommentPostList } from "./CommentPostList";
import { getRecentCommentedPosts, LISTENING_WINDOW_DAYS } from "./zernio-listening";

export async function Comments() {
  if (!isZernioConfigured) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Zernio isn&apos;t configured (no <code className="font-mono">ZERNIO_API_KEY</code>).
      </div>
    );
  }

  let result: Awaited<ReturnType<typeof getRecentCommentedPosts>>;
  try {
    result = await getRecentCommentedPosts();
  } catch (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <p className="font-semibold">Failed to fetch commented posts</p>
        <p className="mt-1 font-mono text-xs">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }

  if (result.posts.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        No posts published in the last {LISTENING_WINDOW_DAYS} days have comments
        across connected accounts.
      </div>
    );
  }

  return <CommentPostList posts={result.posts} />;
}
