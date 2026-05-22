"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { useTRPC, type RouterOutputs } from "@/trpc/react";

type ScannedTweet =
  RouterOutputs["twitter"]["scanNow"]["scored"][number];

const PILLS = [
  { id: "short", label: "Short (<140c)" },
  { id: "no-pitch", label: "No pitch" },
  { id: "lead-with-question", label: "Lead with question" },
  { id: "story-first", label: "Story-first" },
  { id: "focus-wanderos", label: "Focus: WanderOS" },
  { id: "focus-sites", label: "Focus: Sites" },
  { id: "focus-operated", label: "Focus: Operated" },
] as const;

type Pill = (typeof PILLS)[number]["id"];

const ACTION_STYLES: Record<
  ScannedTweet["suggestedAction"],
  { label: string; chip: string }
> = {
  engage: {
    label: "ENGAGE",
    chip: "bg-emerald-100 text-emerald-900",
  },
  monitor: {
    label: "MONITOR",
    chip: "bg-amber-100 text-amber-900",
  },
  skip: {
    label: "SKIP",
    chip: "bg-gray-100 text-gray-700",
  },
};

function ageLabel(createdAt: string): string {
  const minutes = Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / 60_000,
  );
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function TwitterScanWidget() {
  const trpc = useTRPC();
  const scan = useMutation(trpc.twitter.scanNow.mutationOptions());

  const all = scan.data?.scored ?? [];
  const engage = all.filter((s) => s.suggestedAction === "engage");
  const monitor = all.filter((s) => s.suggestedAction === "monitor");
  const skipped = all.length - engage.length - monitor.length;

  return (
    <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-sky-900">
            On-demand AI scoring
          </h4>
          <p className="mt-1 text-sm text-sky-900/80">
            Hits the X recent-search API for brand + STR pain phrases over the
            last 7 days, then runs the results through Claude Sonnet 4.6 to
            surface engagement candidates.
          </p>
        </div>
        <button
          type="button"
          disabled={scan.isPending}
          onClick={() => scan.mutate()}
          className="shrink-0 rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-sky-700/50"
        >
          {scan.isPending ? "Scanning…" : "Scan Twitter now"}
        </button>
      </div>

      {scan.isError && (
        <p className="mt-3 rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-900">
          {scan.error.message}
        </p>
      )}

      {scan.data && (
        <p className="mt-3 text-xs text-sky-900/70">
          Scored {scan.data.totalFetched} tweets · {engage.length} engage ·{" "}
          {monitor.length} monitor · {skipped} skip.
        </p>
      )}

      {engage.length > 0 && (
        <ScoredGroup label="Engage — act today" tone="engage" items={engage} />
      )}
      {monitor.length > 0 && (
        <ScoredGroup label="Monitor — revisit later" tone="monitor" items={monitor} />
      )}
    </div>
  );
}

function ScoredGroup({
  label,
  tone,
  items,
}: {
  label: string;
  tone: "engage" | "monitor";
  items: ScannedTweet[];
}) {
  return (
    <div className="mt-5">
      <h5
        className={`text-xs font-semibold uppercase tracking-wide ${
          tone === "engage" ? "text-emerald-900" : "text-amber-900"
        }`}
      >
        {label} ({items.length})
      </h5>
      <ul className="mt-2 space-y-3">
        {items.map((s) => (
          <li key={s.tweet.id}>
            <ScoredTweetCard scored={s} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScoredTweetCard({ scored }: { scored: ScannedTweet }) {
  const trpc = useTRPC();
  const draft = useMutation(trpc.twitter.draftReply.mutationOptions());
  const [pills, setPills] = useState<Set<Pill>>(new Set());
  const [customInstructions, setCustomInstructions] = useState("");

  const togglePill = (id: Pill) => {
    setPills((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const style = ACTION_STYLES[scored.suggestedAction];

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 font-mono text-xs font-semibold ${style.chip}`}
        >
          {style.label}
        </span>
        <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">
          {scored.relevance}/10
        </span>
        <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">
          {scored.intentTag}
        </span>
        <span className="text-xs text-gray-500">
          @{scored.tweet.authorUsername} · {ageLabel(scored.tweet.createdAt)} ·{" "}
          {scored.tweet.likeCount}♥ {scored.tweet.replyCount}💬
        </span>
      </div>

      <p className="mt-2 text-sm text-gray-900">
        <a
          href={scored.tweet.url}
          target="_blank"
          rel="noreferrer noopener"
          className="hover:text-rose-600"
        >
          {scored.tweet.text}
        </a>
      </p>

      <p className="mt-2 text-sm text-gray-600">{scored.rationale}</p>

      <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
        <p className="text-xs font-semibold text-gray-700">Draft options</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PILLS.map((p) => {
            const on = pills.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePill(p.id)}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  on
                    ? "border-rose-600 bg-rose-600 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <textarea
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value.slice(0, 500))}
          placeholder="Optional: extra instructions"
          rows={2}
          className="mt-2 w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={draft.isPending}
          onClick={() =>
            draft.mutate({
              tweet: scored.tweet,
              intentTag: scored.intentTag,
              rationale: scored.rationale,
              pills: Array.from(pills),
              customInstructions: customInstructions.trim() || undefined,
            })
          }
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {draft.isPending
            ? "Drafting…"
            : draft.data
              ? "Regenerate draft"
              : "Generate draft reply"}
        </button>
        <a
          href={scored.tweet.url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-xs text-gray-500 hover:text-rose-600"
        >
          Open on X ↗
        </a>
        {/*
          TODO: Wire up "Open in Claude". On click, this should copy a
          formatted prompt to the clipboard — including the tweet text,
          author handle, the analyst's scoring context (intent tag,
          rationale), the active draft (if any), and the user's pill/
          custom-instructions modifiers — then open claude.ai in a new
          tab so the user can keep iterating on the draft in their own
          chatbot. Disabled until we settle on the prompt shape.
        */}
        <button
          type="button"
          disabled
          title="Coming soon — will copy the tweet + scoring context + current draft to your clipboard and open Claude in a new tab"
          className="cursor-not-allowed rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-400"
        >
          Open in Claude ↗
        </button>
      </div>

      {draft.isError && (
        <p className="mt-3 rounded-md bg-rose-100 px-3 py-2 text-xs text-rose-900">
          {draft.error.message}
        </p>
      )}

      {draft.data && <DraftReplyBlock draft={draft.data.draft} />}
    </article>
  );
}

function DraftReplyBlock({ draft }: { draft: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-700">
          Draft reply ({draft.length} chars)
        </p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(draft).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="text-xs text-gray-500 hover:text-rose-600"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
        {draft}
      </p>
      <p className="mt-3 text-xs text-gray-500">
        Draft only — review and edit before posting. Twitter limit is 280
        characters.
      </p>
    </div>
  );
}
