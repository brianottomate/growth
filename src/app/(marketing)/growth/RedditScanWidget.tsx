"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { useTRPC, type RouterOutputs } from "@/trpc/react";

type ScannedPost =
  RouterOutputs["reddit"]["scanNow"]["scored"][number];

const PILLS = [
  { id: "short", label: "Short (<80w)" },
  { id: "no-pitch", label: "No pitch" },
  { id: "lead-with-question", label: "Lead with question" },
  { id: "story-first", label: "Story-first" },
  { id: "focus-wanderos", label: "Focus: WanderOS" },
  { id: "focus-sites", label: "Focus: Sites" },
  { id: "focus-operated", label: "Focus: Operated" },
] as const;

type Pill = (typeof PILLS)[number]["id"];

const ACTION_STYLES: Record<
  ScannedPost["suggestedAction"],
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

function ageLabel(createdUtc: number): string {
  const minutes = Math.floor((Date.now() / 1000 - createdUtc) / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function RedditScanWidget() {
  const trpc = useTRPC();
  const scan = useMutation(trpc.reddit.scanNow.mutationOptions());

  const visible = (scan.data?.scored ?? []).filter(
    (s) => s.suggestedAction !== "skip",
  );
  const skipped =
    (scan.data?.scored.length ?? 0) - visible.length;

  return (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-emerald-900">
            On-demand AI scoring
          </h4>
          <p className="mt-1 text-sm text-emerald-900/80">
            Fetches the latest posts across the Tier 1 subs and runs them
            through Claude Haiku 4.5 to surface engagement candidates.
            Sign-in required.
          </p>
        </div>
        <button
          type="button"
          disabled={scan.isPending}
          onClick={() => scan.mutate()}
          className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-700/50"
        >
          {scan.isPending ? "Scanning…" : "Scan Reddit now"}
        </button>
      </div>

      {scan.isError && (
        <p className="mt-3 rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-900">
          {scan.error.message}
        </p>
      )}

      {scan.data && (
        <p className="mt-3 text-xs text-emerald-900/70">
          Scored {scan.data.totalFetched} posts · showing{" "}
          {visible.length} engage/monitor · {skipped} skipped.
        </p>
      )}

      {visible.length > 0 && (
        <ul className="mt-4 space-y-3">
          {visible.map((s) => (
            <li key={s.post.id}>
              <ScoredPostCard scored={s} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScoredPostCard({ scored }: { scored: ScannedPost }) {
  const trpc = useTRPC();
  const draft = useMutation(trpc.reddit.draftReply.mutationOptions());
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
          r/{scored.post.subreddit} · {ageLabel(scored.post.createdUtc)} ·{" "}
          {scored.post.ups}↑ {scored.post.numComments}c
        </span>
      </div>

      <h3 className="mt-2 text-sm font-semibold text-gray-900">
        <a
          href={scored.post.url}
          target="_blank"
          rel="noreferrer noopener"
          className="hover:text-rose-600"
        >
          {scored.post.title}
        </a>
      </h3>

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
          placeholder="Optional: extra instructions (e.g. 'mention I'm a fellow operator in Florida')"
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
              post: scored.post,
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
          href={scored.post.url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-xs text-gray-500 hover:text-rose-600"
        >
          Open on Reddit ↗
        </a>
      </div>

      {draft.isError && (
        <p className="mt-3 rounded-md bg-rose-100 px-3 py-2 text-xs text-rose-900">
          {draft.error.message}
        </p>
      )}

      {draft.data && (
        <DraftReplyBlock draft={draft.data.draft} />
      )}
    </article>
  );
}

function DraftReplyBlock({ draft }: { draft: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-700">Draft reply</p>
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
        Draft only — review and edit before posting. Disclosure of Wander
        affiliation is intentional; do not remove.
      </p>
    </div>
  );
}
