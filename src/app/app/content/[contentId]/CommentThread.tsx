"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/orpc/client";
import { OwnerAvatar } from "@/components/assignment/assignee";

const rel = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
};

/** Light team discussion on a content idea. Distinct from audience comment
 *  counts (those live in platform stats). */
export function CommentThread({
  contentPostId,
  currentUserId,
}: {
  contentPostId: string;
  currentUserId: string;
}) {
  const qc = useQueryClient();
  const opts = orpc.content.comments.queryOptions({ input: { contentPostId } });
  const { data: comments = [] } = useQuery(opts);
  const invalidate = () => qc.invalidateQueries({ queryKey: opts.queryKey });

  const [body, setBody] = useState("");
  const add = useMutation(
    orpc.content.addComment.mutationOptions({
      onSuccess: () => {
        setBody("");
        void invalidate();
      },
    }),
  );
  const del = useMutation(
    orpc.content.deleteComment.mutationOptions({ onSuccess: invalidate }),
  );

  const submit = () => {
    const text = body.trim();
    if (text) add.mutate({ contentPostId, body: text });
  };

  return (
    <div className="mt-2 flex flex-col gap-3">
      {comments.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No comments yet — start the discussion.
        </p>
      )}
      {comments.map((c) => (
        <div key={c.id} className="flex gap-2">
          <OwnerAvatar member={c.author} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {c.author?.name ?? "Unknown"}
              </span>
              <span className="text-xs text-muted-foreground">
                {rel(c.createdAt)}
              </span>
              {c.authorId === currentUserId && (
                <button
                  onClick={() => del.mutate({ id: c.id })}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                >
                  Delete
                </button>
              )}
            </div>
            <p className="text-sm leading-snug whitespace-pre-wrap">{c.body}</p>
          </div>
        </div>
      ))}

      <div className="mt-1 flex flex-col gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
          rows={2}
          placeholder="Add a comment… (⌘↵ to post)"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={!body.trim() || add.isPending}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {add.isPending ? "Posting…" : "Comment"}
          </button>
        </div>
      </div>
    </div>
  );
}
