"use client";
import { useId, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/server/better-auth/client";
import { ChevronDown, MessageSquare } from "lucide-react";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { OwnerAvatar } from "@/components/assignment/assignee";
import type { ReviewTarget } from "@/lib/review-target";

export function ReviewDiscussion({
  target,
  defaultOpen = false,
  summary,
  actions,
}: {
  target: ReviewTarget;
  defaultOpen?: boolean;
  summary?: ReactNode;
  actions?: ReactNode;
}) {
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState(defaultOpen);
  const discussionId = useId();
  const [body, setBody] = useState("");
  const qc = useQueryClient();
  const opts = orpc.review.comments.queryOptions({ input: { target } });
  const query = useQuery(opts);
  const add = useMutation(
    orpc.review.addComment.mutationOptions({
      onSuccess: () => {
        setBody("");
        void qc.invalidateQueries({ queryKey: opts.queryKey });
      },
    }),
  );
  const remove = useMutation(
    orpc.review.deleteComment.mutationOptions({
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: opts.queryKey });
      },
    }),
  );
  const submit = () => {
    if (body.trim()) add.mutate({ target, body: body.trim(), as: "user" });
  };
  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {summary}
          <Button
            size="sm"
            variant={open ? "secondary" : "ghost"}
            aria-expanded={open}
            aria-controls={discussionId}
            aria-label={open ? "Hide review comments" : "Show review comments"}
            onClick={() => setOpen(!open)}
          >
            <MessageSquare className="size-3.5" />
            {open ? "Hide comments" : "Comments"}
            {query.data?.length ? ` · ${query.data.length}` : ""}
            <ChevronDown
              aria-hidden="true"
              className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </Button>
        </div>
        {actions && (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {actions}
          </div>
        )}
      </div>
      {open && (
        <section
          id={discussionId}
          aria-label="Review discussion"
          className="space-y-4 border-t pt-4"
        >
          {query.isLoading && (
            <p className="text-sm text-muted-foreground">Loading comments…</p>
          )}
          {query.error && (
            <p role="alert" className="text-sm">
              Could not load comments.{" "}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void query.refetch()}
              >
                Try again
              </Button>
            </p>
          )}
          {query.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          )}
          {query.data?.map((comment) => (
            <div key={comment.id} className="flex gap-2">
              <OwnerAvatar
                member={comment.actorKind === "user" ? comment.author : null}
                size="sm"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {comment.actorKind === "agent"
                      ? `Growth assistant · for ${comment.author.name ?? "teammate"}`
                      : `${comment.author.name ?? "Teammate"}${comment.viaAgent ? " · via Growth assistant" : ""}`}
                  </span>
                  {" · "}
                  {new Date(comment.createdAt).toLocaleString()}
                </p>
                <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
              </div>
              {comment.authorId === session?.user.id &&
                comment.event === "comment" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ id: comment.id })}
                  >
                    Delete
                  </Button>
                )}
            </div>
          ))}
          <textarea
            aria-label="Review comment"
            placeholder="Add a comment…"
            className="min-h-20 w-full rounded-md border bg-background p-3 text-sm"
            value={body}
            maxLength={8000}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter")
                submit();
            }}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!body.trim() || add.isPending}
              onClick={submit}
            >
              Comment
            </Button>
          </div>
          {remove.error && (
            <p role="alert" className="text-sm">
              {remove.error.message}
            </p>
          )}
          {add.error && (
            <p role="alert" className="text-sm">
              {add.error.message}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
