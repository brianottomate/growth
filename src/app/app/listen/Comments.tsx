import {
  isZernioConfigured,
  type ZernioCommentedPost,
} from "@/server/clients/zernio.client";

import { ListenItemActions } from "./ListenItemActions";
import {
  buildPostContext,
  getRecentCommentedPosts,
  LISTENING_WINDOW_DAYS,
} from "./zernio-listening";

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

  return (
    <ul className="divide-y rounded-lg border bg-card">
      {result.posts.map((post, idx) => (
        <PostRow key={String(post.id ?? idx)} post={post} />
      ))}
    </ul>
  );
}

function PostRow({ post }: { post: ZernioCommentedPost }) {
  const body = (post.content ?? "").trim();
  const short = body.length > 220 ? `${body.slice(0, 220)}…` : body;
  const when = post.createdTime ? new Date(post.createdTime) : null;
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-foreground">
              {post.accountUsername ?? "(account)"}
            </span>
            {when ? (
              <span className="text-xs text-muted-foreground">
                · {when.toLocaleDateString()}
              </span>
            ) : null}
            {post.isAd ? (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                ad
              </span>
            ) : null}
            {post.subreddit ? (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                r/{post.subreddit}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm whitespace-pre-line text-foreground/90">
            {short || (
              <span className="text-muted-foreground italic">(no text)</span>
            )}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">
                {post.commentCount ?? 0}
              </span>{" "}
              comment{(post.commentCount ?? 0) === 1 ? "" : "s"}
            </span>
            {typeof post.likeCount === "number" ? (
              <span>
                <span className="font-medium text-foreground">
                  {post.likeCount}
                </span>{" "}
                likes
              </span>
            ) : null}
            {post.permalink ? (
              <a
                href={post.permalink}
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary hover:underline"
              >
                open ↗
              </a>
            ) : null}
          </div>
          <ListenItemActions context={buildPostContext(post)} />
        </div>
        <span className="shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {post.platform ?? "?"}
        </span>
      </div>
    </li>
  );
}
