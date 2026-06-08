"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useTRPC, type RouterOutputs } from "@/trpc/react";
import type { ZernioCommentedPost } from "@/server/clients/zernio.client";

import { ListenItemActions } from "./ListenItemActions";

type PostComment = RouterOutputs["inbox"]["postComments"]["comments"][number];

export function CommentPostList({ posts }: { posts: ZernioCommentedPost[] }) {
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {posts.map((post, idx) => (
        <PostRow key={String(post.id ?? idx)} post={post} />
      ))}
    </ul>
  );
}

function PostRow({ post }: { post: ZernioCommentedPost }) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);

  const postId = post.id ?? "";
  const accountId = post.accountId ?? "";
  const canDrill = Boolean(postId && accountId);

  const comments = useQuery(
    trpc.inbox.postComments.queryOptions(
      { postId, accountId },
      { enabled: open && canDrill },
    ),
  );

  const body = (post.content ?? "").trim();
  const short = body.length > 220 ? `${body.slice(0, 220)}…` : body;
  const when = post.createdTime ? new Date(post.createdTime) : null;
  const count = post.commentCount ?? 0;

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
            {post.subreddit ? (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                r/{post.subreddit}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm whitespace-pre-line text-foreground/90">
            {short || <span className="text-muted-foreground italic">(no text)</span>}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {canDrill ? (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="hover:text-foreground"
              >
                {open ? "Hide" : "View"} {count} comment{count === 1 ? "" : "s"}
              </button>
            ) : (
              <span>
                {count} comment{count === 1 ? "" : "s"}
              </span>
            )}
            {typeof post.likeCount === "number" ? <span>{post.likeCount} likes</span> : null}
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

          {open ? (
            <div className="mt-3 border-t pt-3">
              {comments.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading comments…</p>
              ) : comments.isError ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {comments.error.message}
                </p>
              ) : (comments.data?.comments.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">No comments returned.</p>
              ) : (
                <ul className="space-y-3">
                  {comments.data!.comments.map((c, i) => (
                    <CommentRow key={c.id ?? i} comment={c} post={post} />
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
        <span className="shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {post.platform ?? "?"}
        </span>
      </div>
    </li>
  );
}

function CommentRow({
  comment: c,
  post,
}: {
  comment: PostComment;
  post: ZernioCommentedPost;
}) {
  const author = c.from?.name ?? c.from?.username ?? "Unknown";
  const isOwner = c.from?.isOwner === true;
  const body = (c.message ?? "").trim();

  return (
    <li className="rounded-lg border bg-background p-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="text-xs font-medium text-foreground">{author}</span>
        {isOwner ? (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
            you
          </span>
        ) : null}
        {c.createdTime ? (
          <span className="text-[10px] text-muted-foreground">
            · {new Date(c.createdTime).toLocaleDateString()}
          </span>
        ) : null}
        {c.replyCount ? (
          <span className="text-[10px] text-muted-foreground">· {c.replyCount} replies</span>
        ) : null}
      </div>
      <p className="mt-1 text-sm whitespace-pre-line text-foreground/90">
        {body || <span className="text-muted-foreground italic">(no text)</span>}
      </p>
      {!isOwner ? (
        <ListenItemActions context={buildCommentContext(post, c, author, body)} />
      ) : null}
    </li>
  );
}

function buildCommentContext(
  post: ZernioCommentedPost,
  c: PostComment,
  author: string,
  body: string,
): string {
  const postText = (post.content ?? "").trim();
  return [
    "Help me reply to this comment on one of Wander's owned social posts. Wander is a direct-booking platform for short-term-rental operators. Tone: warm, helpful, not salesy; disclose Wander affiliation.",
    "",
    `Platform: ${post.platform ?? "?"}`,
    `Our post: "${postText.slice(0, 300) || "(no text)"}"`,
    `Comment by ${author}: "${body || "(no text)"}"`,
    c.url ? `Link: ${c.url}` : (post.permalink ? `Post: ${post.permalink}` : null),
  ]
    .filter(Boolean)
    .join("\n");
}
