"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { ListenItemActions } from "@/components/listening/ListenItemActions";
import { useTRPC } from "@/trpc/react";

/**
 * MVP unified queue — one relevance-ranked worklist across DMs, Reddit, and X.
 * "Scan everything" fans out to the three existing on-demand scorers in parallel
 * and merges their scored items into a single list. Stateless like the rest of
 * triage; this exists to *feel* the cross-channel queue before we commit to a
 * persisted, assignable inbox. Lives on the "All" tab only and doesn't touch the
 * per-channel sections below it.
 */

type QueueChannel = "dm" | "reddit" | "x";

const CHANNEL_META: Record<QueueChannel, { label: string; chip: string }> = {
  dm: { label: "DM", chip: "bg-sky-500/15 text-sky-400" },
  reddit: { label: "Reddit", chip: "bg-orange-500/15 text-orange-400" },
  x: { label: "X", chip: "bg-zinc-500/20 text-zinc-300" },
};

const ACTION_STYLES: Record<
  "engage" | "monitor" | "skip",
  { label: string; chip: string }
> = {
  engage: { label: "ENGAGE", chip: "bg-emerald-500/15 text-emerald-400" },
  monitor: { label: "MONITOR", chip: "bg-amber-500/15 text-amber-400" },
  skip: { label: "SKIP", chip: "bg-muted text-muted-foreground" },
};

interface QueueItem {
  key: string;
  channel: QueueChannel;
  relevance: number;
  intentTag: string;
  suggestedAction: "engage" | "monitor" | "skip";
  rationale: string;
  title: string;
  subtitle?: string;
  url?: string;
  context: string;
}

/** Minimal conversation shape needed to render a DM row (joined by id). */
export interface QueueConversation {
  id: string;
  participantName?: string;
  participantUsername?: string;
  platform?: string;
  lastMessage?: string;
  url?: string;
}

export function UnifiedQueue({
  conversations,
}: {
  conversations: QueueConversation[];
}) {
  const trpc = useTRPC();
  const triageDms = useMutation(trpc.inbox.triageNow.mutationOptions());
  const scanReddit = useMutation(trpc.reddit.scanNow.mutationOptions());
  const scanX = useMutation(trpc.twitter.scanNow.mutationOptions());

  const [ran, setRan] = useState(false);

  const convoById = useMemo(() => {
    const m = new Map<string, QueueConversation>();
    for (const c of conversations) m.set(c.id, c);
    return m;
  }, [conversations]);

  const pending =
    triageDms.isPending || scanReddit.isPending || scanX.isPending;

  const scanEverything = async () => {
    setRan(true);
    await Promise.allSettled([
      triageDms.mutateAsync(),
      scanReddit.mutateAsync(),
      scanX.mutateAsync(),
    ]);
  };

  const items = useMemo<QueueItem[]>(() => {
    const out: QueueItem[] = [];

    for (const s of triageDms.data?.scored ?? []) {
      const c = convoById.get(s.conversationId);
      const name =
        c?.participantName ?? c?.participantUsername ?? "Unknown sender";
      out.push({
        key: `dm:${s.conversationId}`,
        channel: "dm",
        relevance: s.relevance,
        intentTag: s.intentTag,
        suggestedAction: s.suggestedAction,
        rationale: s.rationale,
        title: name,
        subtitle: c?.lastMessage,
        url: c?.url,
        context: [
          "Help me reply to this social DM. Wander is a direct-booking platform for short-term-rental operators (WanderOS, Wander Sites, Wander Operated). Tone: warm, human, concise; disclose Wander affiliation.",
          "",
          `Platform: ${c?.platform ?? "instagram"} DM`,
          `From: ${name}`,
          `Triaged as: ${s.intentTag} · relevance ${s.relevance}/10`,
          `Last message: ${c?.lastMessage ?? "(none)"}`,
        ].join("\n"),
      });
    }

    for (const s of scanReddit.data?.scored ?? []) {
      out.push({
        key: `reddit:${s.post.id}`,
        channel: "reddit",
        relevance: s.relevance,
        intentTag: s.intentTag,
        suggestedAction: s.suggestedAction,
        rationale: s.rationale,
        title: s.post.title,
        subtitle: `r/${s.post.subreddit} · ${s.post.ups}↑ ${s.post.numComments}c`,
        url: s.post.url,
        context: [
          "Help me write a reply to this Reddit post. Wander is a direct-booking platform for short-term-rental operators. Tone: warm, peer-to-peer, helpful, not a pitch. Disclose Wander affiliation.",
          "",
          `Subreddit: r/${s.post.subreddit}`,
          `Post: ${s.post.title}`,
          `Intent: ${s.intentTag} · relevance ${s.relevance}/10`,
          `Link: ${s.post.url}`,
        ].join("\n"),
      });
    }

    for (const s of scanX.data?.scored ?? []) {
      out.push({
        key: `x:${s.tweet.id}`,
        channel: "x",
        relevance: s.relevance,
        intentTag: s.intentTag,
        suggestedAction: s.suggestedAction,
        rationale: s.rationale,
        title: `@${s.tweet.authorUsername}`,
        subtitle: s.tweet.text,
        url: s.tweet.url,
        context: [
          "Help me write a reply to this tweet. Wander is a direct-booking platform for short-term-rental operators. Tone: human operator, casual, helpful. Disclose Wander affiliation if mentioning Wander.",
          "",
          `Author: @${s.tweet.authorUsername}`,
          `Tweet: ${s.tweet.text}`,
          `Intent: ${s.intentTag} · relevance ${s.relevance}/10`,
          `Link: ${s.tweet.url}`,
        ].join("\n"),
      });
    }

    // Engage first, then by relevance — skips drop to the bottom.
    const actionRank = { engage: 0, monitor: 1, skip: 2 };
    return out.sort(
      (a, b) =>
        actionRank[a.suggestedAction] - actionRank[b.suggestedAction] ||
        b.relevance - a.relevance,
    );
  }, [triageDms.data, scanReddit.data, scanX.data, convoById]);

  const engage = items.filter((i) => i.suggestedAction === "engage");
  const rest = items.filter((i) => i.suggestedAction !== "skip" && i.suggestedAction !== "engage");

  const errors = [
    triageDms.error && `DMs: ${triageDms.error.message}`,
    scanReddit.error && `Reddit: ${scanReddit.error.message}`,
    scanX.error && `X: ${scanX.error.message}`,
  ].filter(Boolean) as string[];

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Priority queue</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            One ranked worklist across DMs, Reddit, and X. Scans all three on
            demand and sorts by suggested action then relevance.{" "}
            <span className="text-xs">(MVP — nothing persisted yet.)</span>
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={scanEverything}
          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Scanning…" : ran ? "Re-scan everything" : "Scan everything"}
        </button>
      </div>

      {ran && !pending ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {engage.length} engage · {rest.length} monitor ·{" "}
          {items.length - engage.length - rest.length} skip across {items.length}{" "}
          scored items.
        </p>
      ) : null}

      {errors.length > 0 ? (
        <div className="mt-3 space-y-1">
          {errors.map((e) => (
            <p
              key={e}
              className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {e}
            </p>
          ))}
        </div>
      ) : null}

      {engage.length > 0 ? (
        <QueueGroup label="Engage — act today" items={engage} />
      ) : null}
      {rest.length > 0 ? (
        <QueueGroup label="Monitor — revisit" items={rest} />
      ) : null}

      {ran && !pending && items.length === 0 && errors.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nothing scored. Either no inbound activity or everything was filtered as
          noise.
        </p>
      ) : null}
    </section>
  );
}

function QueueGroup({ label, items }: { label: string; items: QueueItem[] }) {
  return (
    <div className="mt-5">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label} ({items.length})
      </h3>
      <ul className="mt-2 divide-y rounded-lg border bg-background">
        {items.map((item) => (
          <QueueRow key={item.key} item={item} />
        ))}
      </ul>
    </div>
  );
}

function QueueRow({ item }: { item: QueueItem }) {
  const channel = CHANNEL_META[item.channel];
  const action = ACTION_STYLES[item.suggestedAction];

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 font-mono text-xs font-semibold ${channel.chip}`}
        >
          {channel.label}
        </span>
        <span
          className={`rounded px-2 py-0.5 font-mono text-xs font-semibold ${action.chip}`}
        >
          {action.label}
        </span>
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {item.relevance}/10
        </span>
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {item.intentTag}
        </span>
      </div>

      <p className="mt-1.5 text-sm font-medium text-foreground">{item.title}</p>
      {item.subtitle ? (
        <p className="mt-0.5 line-clamp-2 text-sm text-foreground/80">
          {item.subtitle}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-muted-foreground">{item.rationale}</p>

      <div className="mt-1.5 flex items-center gap-3">
        <ListenItemActions context={item.context} />
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs text-muted-foreground hover:text-primary"
          >
            open ↗
          </a>
        ) : null}
      </div>
    </li>
  );
}
