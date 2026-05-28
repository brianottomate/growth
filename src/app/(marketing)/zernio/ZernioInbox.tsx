import {
  isZernioConfigured,
  listZernioCommentedPosts,
  type ZernioCommentedPost,
} from "@/server/clients/zernio.client";

export async function ZernioInbox() {
  if (!isZernioConfigured) {
    return null;
  }

  let result: Awaited<ReturnType<typeof listZernioCommentedPosts>>;
  try {
    result = await listZernioCommentedPosts({
      sortBy: "comments",
      sortOrder: "desc",
      minComments: 1,
      limit: 50,
    });
  } catch (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        <p className="font-semibold">Failed to fetch commented posts</p>
        <p className="mt-1 font-mono text-xs">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }

  if (result.posts.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
        No posts with comments across connected accounts.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
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
            <span className="text-sm font-medium text-gray-900">
              {post.accountUsername ?? "(account)"}
            </span>
            {when ? (
              <span className="text-xs text-gray-500">
                · {when.toLocaleDateString()}
              </span>
            ) : null}
            {post.isAd ? (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-900">
                ad
              </span>
            ) : null}
            {post.subreddit ? (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700">
                r/{post.subreddit}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm whitespace-pre-line text-gray-800">
            {short || (
              <span className="text-gray-400 italic">(no text)</span>
            )}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
            <span>
              <span className="font-medium text-gray-900">
                {post.commentCount ?? 0}
              </span>{" "}
              comment{(post.commentCount ?? 0) === 1 ? "" : "s"}
            </span>
            {typeof post.likeCount === "number" ? (
              <span>
                <span className="font-medium text-gray-900">
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
                className="text-rose-600 hover:underline"
              >
                open ↗
              </a>
            ) : null}
          </div>
        </div>
        <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">
          {post.platform ?? "?"}
        </span>
      </div>
    </li>
  );
}
