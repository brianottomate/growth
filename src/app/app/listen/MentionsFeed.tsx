"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useTRPC, type RouterOutputs } from "@/trpc/react";

import { ListenItemActions } from "@/components/listening/ListenItemActions";

type Mention = RouterOutputs["mention"]["list"]["mentions"][number];

const ACTION_STYLES: Record<string, { label: string; chip: string }> = {
  engage: { label: "ENGAGE", chip: "bg-emerald-500/15 text-emerald-400" },
  monitor: { label: "MONITOR", chip: "bg-amber-500/15 text-amber-400" },
  skip: { label: "SKIP", chip: "bg-muted text-muted-foreground" },
};

function relTime(date: Date | string): string {
  const ms = Date.now() - new Date(date).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function MentionsFeed() {
  const trpc = useTRPC();
  const { data, isLoading, isError, error } = useQuery(
    trpc.mention.list.queryOptions(),
  );

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Loading mentions…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error.message}
      </div>
    );
  }

  const mentions = data?.mentions ?? [];
  if (mentions.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        No mentions yet. Once F5Bot alerts are forwarded to{" "}
        <code className="font-mono">f5bot@lexaomo.resend.app</code>, they&apos;ll
        land here — extracted and scored automatically.
      </div>
    );
  }

  // Bucket: engage first, then monitor / unscored, then keep skip out (the
  // list query already excludes skipped). Within a bucket, relevance desc.
  const byRelevance = (a: Mention, b: Mention) =>
    (b.relevance ?? -1) - (a.relevance ?? -1);
  const engage = mentions
    .filter((m) => m.suggestedAction === "engage")
    .sort(byRelevance);
  const rest = mentions
    .filter((m) => m.suggestedAction !== "engage")
    .sort(byRelevance);

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        {mentions.length} open mention{mentions.length === 1 ? "" : "s"} ·{" "}
        {engage.length} to engage
        {data && data.skippedCount > 0 ? ` · ${data.skippedCount} skipped` : ""}
      </p>

      {engage.length > 0 && (
        <Group label="Engage — act today" tone="engage" items={engage} />
      )}
      {rest.length > 0 && (
        <Group label="Monitor / unscored" tone="monitor" items={rest} />
      )}
    </div>
  );
}

function Group({
  label,
  tone,
  items,
}: {
  label: string;
  tone: "engage" | "monitor";
  items: Mention[];
}) {
  return (
    <div>
      <h5
        className={`text-xs font-semibold tracking-wide uppercase ${
          tone === "engage" ? "text-emerald-400" : "text-amber-400"
        }`}
      >
        {label} ({items.length})
      </h5>
      <ul className="mt-2 space-y-3">
        {items.map((m) => (
          <li key={m.id}>
            <MentionCard mention={m} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function MentionCard({ mention: m }: { mention: Mention }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const setStatus = useMutation(
    trpc.mention.setStatus.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(trpc.mention.list.queryOptions());
      },
    }),
  );

  const [editingReply, setEditingReply] = useState(false);
  const [replyUrl, setReplyUrl] = useState(m.replyUrl ?? "");
  const [replyNote, setReplyNote] = useState(m.replyNote ?? "");

  const saveReply = () => {
    setStatus.mutate({
      id: m.id,
      status: "engaged",
      replyUrl: replyUrl.trim() || null,
      replyNote: replyNote.trim() || null,
    });
    setEditingReply(false);
  };

  const style = m.suggestedAction
    ? ACTION_STYLES[m.suggestedAction]
    : undefined;

  const sourceLabel = [
    m.source,
    m.subreddit ? `r/${m.subreddit}` : null,
    m.sourceType,
  ]
    .filter(Boolean)
    .join(" · ");

  const context = [
    "Help me write a reply to this social mention. Wander is a direct-booking platform for short-term-rental operators (WanderOS, Wander Sites, Wander Operated). Tone: warm, peer-to-peer, genuinely helpful, not a pitch. Disclose Wander affiliation. Keep it concise.",
    "",
    `Source: ${sourceLabel}`,
    m.keyword ? `Matched keyword: ${m.keyword}` : null,
    m.title ? `Title: ${m.title}` : null,
    m.author ? `Author: ${m.author}` : null,
    m.relevance != null
      ? `Intent: ${m.intentTag} · relevance ${m.relevance}/10`
      : null,
    m.rationale ? `Why: ${m.rationale}` : null,
    `Text: ${m.snippet ?? "(none)"}`,
    `Link: ${m.url}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <article className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        {style && (
          <span
            className={`rounded px-2 py-0.5 font-mono text-xs font-semibold ${style.chip}`}
          >
            {style.label}
          </span>
        )}
        {m.relevance != null && (
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {m.relevance}/10
          </span>
        )}
        {m.intentTag && (
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {m.intentTag}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {sourceLabel} · {relTime(m.receivedAt)}
        </span>
        {m.keyword && (
          <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
            {m.keyword}
          </span>
        )}
      </div>

      {m.title && (
        <h3 className="mt-2 text-sm font-semibold text-foreground">
          <a
            href={m.url}
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-primary"
          >
            {m.title}
          </a>
        </h3>
      )}

      {m.snippet && (
        <p className="mt-1 text-sm whitespace-pre-line text-foreground/90">
          {m.snippet}
        </p>
      )}

      {m.rationale && (
        <p className="mt-2 text-xs text-muted-foreground">{m.rationale}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={setStatus.isPending}
          onClick={() => setStatus.mutate({ id: m.id, status: "engaged" })}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          Mark engaged
        </button>
        <button
          type="button"
          disabled={setStatus.isPending}
          onClick={() => setStatus.mutate({ id: m.id, status: "skipped" })}
          className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          Skip
        </button>
        <a
          href={m.url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-xs text-muted-foreground hover:text-primary"
        >
          Open ↗
        </a>
        {m.status === "engaged" &&
          (m.replyUrl ? (
            <a
              href={m.replyUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
              title={m.replyNote ?? undefined}
            >
              ✓ replied ↗
            </a>
          ) : (
            <span className="text-xs font-medium text-emerald-400">
              ✓ engaged
            </span>
          ))}
        <button
          type="button"
          onClick={() => setEditingReply((v) => !v)}
          className="text-xs text-muted-foreground hover:text-primary"
        >
          {m.replyUrl ? "edit reply" : "＋ reply link"}
        </button>
      </div>

      {editingReply && (
        <div className="mt-2 space-y-2 rounded-lg border bg-background/50 p-3">
          <input
            type="url"
            value={replyUrl}
            onChange={(e) => setReplyUrl(e.target.value)}
            placeholder="Permalink to our reply (e.g. https://reddit.com/r/vrbo/comments/…)"
            className="w-full rounded-md border bg-background px-2 py-1 text-xs"
          />
          <input
            type="text"
            value={replyNote}
            onChange={(e) => setReplyNote(e.target.value)}
            placeholder="Note (optional) — e.g. replied by Hashim, Wander brand acct"
            className="w-full rounded-md border bg-background px-2 py-1 text-xs"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={setStatus.isPending}
              onClick={saveReply}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              Save reply
            </button>
            <button
              type="button"
              onClick={() => setEditingReply(false)}
              className="rounded-md border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <ListenItemActions context={context} />
    </article>
  );
}
