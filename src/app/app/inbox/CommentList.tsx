"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { useTRPC, type RouterOutputs } from "@/trpc/react";
import type { OrganicCommentItem } from "./zernio-listening";
import { ListenItemActions } from "@/components/listening/ListenItemActions";

type Scored = RouterOutputs["inbox"]["triageComments"]["scored"][number];

const ACTION_STYLES: Record<
  Scored["suggestedAction"],
  { label: string; chip: string }
> = {
  engage: { label: "ENGAGE", chip: "bg-emerald-500/15 text-emerald-400" },
  monitor: { label: "MONITOR", chip: "bg-amber-500/15 text-amber-400" },
  skip: { label: "SKIP", chip: "bg-muted text-muted-foreground" },
};

function commentContext(item: OrganicCommentItem): string {
  const post = (item.post.content ?? "").trim();
  const author =
    item.comment.from?.name ?? item.comment.from?.username ?? "Unknown";
  const body = (item.comment.message ?? "").trim();
  return [
    "Help me reply to this comment on one of Wander's owned social posts. Wander is a direct-booking platform for short-term-rental operators. Tone: warm, helpful, not salesy; disclose Wander affiliation.",
    "",
    `Platform: ${item.post.platform ?? "?"}`,
    `Our post: "${post.slice(0, 300) || "(no text)"}"`,
    `Comment by ${author}: "${body || "(no text)"}"`,
    item.comment.url ? `Link: ${item.comment.url}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function CommentList({ items }: { items: OrganicCommentItem[] }) {
  const trpc = useTRPC();
  const triage = useMutation(trpc.inbox.triageComments.mutationOptions());

  const scores = useMemo(() => {
    const m = new Map<string, Scored>();
    for (const s of triage.data?.scored ?? []) m.set(s.commentId, s);
    return m;
  }, [triage.data]);

  const withId = useMemo(
    () => items.filter((i) => typeof i.comment.id === "string"),
    [items],
  );

  // Needs-reply first, then triage relevance (no-op until triaged → preserves
  // the loader's needs-reply-then-recency order via the stable sort).
  const sorted = useMemo(
    () =>
      [...withId].sort((a, b) => {
        if (a.needsReply !== b.needsReply) return a.needsReply ? -1 : 1;
        return (
          (scores.get(b.comment.id!)?.relevance ?? -1) -
          (scores.get(a.comment.id!)?.relevance ?? -1)
        );
      }),
    [withId, scores],
  );

  const platforms = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of sorted) {
      const p = i.post.platform ?? "other";
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [sorted]);

  const [platform, setPlatform] = useState<string>("all");
  const [needsReplyOnly, setNeedsReplyOnly] = useState(false);

  const needsReplyCount = useMemo(
    () => sorted.filter((i) => i.needsReply).length,
    [sorted],
  );

  const visible = useMemo(() => {
    let list =
      platform === "all"
        ? sorted
        : sorted.filter((i) => (i.post.platform ?? "other") === platform);
    if (needsReplyOnly) list = list.filter((i) => i.needsReply);
    return list;
  }, [sorted, platform, needsReplyOnly]);

  const runTriage = () =>
    triage.mutate({
      comments: withId.map((i) => ({
        id: i.comment.id!,
        platform: i.post.platform,
        author: i.comment.from?.name ?? i.comment.from?.username,
        postContent: i.post.content,
        message: i.comment.message ?? "",
      })),
    });

  if (withId.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        No comments on owned posts in the window.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm text-muted-foreground">
            {visible.length} comment{visible.length === 1 ? "" : "s"}
            {platform !== "all" ? ` · ${platform}` : ""}
          </p>
          <button
            type="button"
            onClick={() => setNeedsReplyOnly((v) => !v)}
            aria-pressed={needsReplyOnly}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              needsReplyOnly
                ? "border-amber-500 bg-amber-500/15 text-amber-400"
                : "bg-background text-muted-foreground hover:bg-accent"
            }`}
          >
            Needs reply ({needsReplyCount})
          </button>
        </div>
        <button
          type="button"
          disabled={triage.isPending}
          onClick={runTriage}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {triage.isPending ? "Triaging…" : "Triage comments"}
        </button>
      </div>

      {platforms.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {(
            [["all", sorted.length] as const] as ReadonlyArray<
              readonly [string, number]
            >
          )
            .concat(platforms)
            .map(([p, n]) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                className={`rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors ${
                  platform === p
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent"
                }`}
              >
                {p === "all" ? "All" : p} ({n})
              </button>
            ))}
        </div>
      ) : null}

      {triage.isError ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {triage.error.message}
        </p>
      ) : null}

      <ul className="space-y-3">
        {visible.map((item) => (
          <li key={item.comment.id}>
            <CommentRow item={item} score={scores.get(item.comment.id!)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CommentRow({
  item,
  score,
}: {
  item: OrganicCommentItem;
  score?: Scored;
}) {
  const trpc = useTRPC();
  const draft = useMutation(trpc.inbox.draftCommentReply.mutationOptions());

  const author =
    item.comment.from?.name ?? item.comment.from?.username ?? "Unknown";
  const body = (item.comment.message ?? "").trim();
  const post = (item.post.content ?? "").trim();
  const style = score ? ACTION_STYLES[score.suggestedAction] : null;

  return (
    <article className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="text-sm font-medium text-foreground">{author}</span>
        {item.comment.createdTime ? (
          <span className="text-xs text-muted-foreground">
            · {new Date(item.comment.createdTime).toLocaleDateString()}
          </span>
        ) : null}
        {item.needsReply ? (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-400">
            Needs reply
          </span>
        ) : null}
        {style ? (
          <>
            <span
              className={`rounded px-2 py-0.5 font-mono text-xs font-semibold ${style.chip}`}
            >
              {style.label}
            </span>
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
              {score!.relevance}/10
            </span>
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
              {score!.intentTag}
            </span>
          </>
        ) : null}
        <span className="ml-auto shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {item.post.platform ?? "?"}
        </span>
      </div>

      <p className="mt-1.5 text-sm whitespace-pre-line text-foreground/90">
        {body || (
          <span className="text-muted-foreground italic">(no text)</span>
        )}
      </p>

      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
        on your post: {post || "(no text)"}
      </p>
      {score?.rationale ? (
        <p className="mt-1 text-xs text-muted-foreground">{score.rationale}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <button
          type="button"
          disabled={draft.isPending}
          onClick={() =>
            draft.mutate({
              platform: item.post.platform,
              author,
              postContent: item.post.content,
              message: body,
              intentTag: score?.intentTag,
              rationale: score?.rationale,
            })
          }
          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {draft.isPending
            ? "Drafting…"
            : draft.data
              ? "Regenerate draft"
              : "Draft reply"}
        </button>
        {item.comment.url ? (
          <a
            href={item.comment.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground hover:text-primary"
          >
            Reply on {item.post.platform ?? "platform"} ↗
          </a>
        ) : null}
      </div>

      <ListenItemActions context={commentContext(item)} />

      {draft.data ? (
        <div className="mt-3 rounded-lg border bg-background p-3">
          <p className="text-xs font-semibold text-foreground">Draft reply</p>
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
            {draft.data.draft}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Draft only — review and post natively.
          </p>
        </div>
      ) : null}
    </article>
  );
}
