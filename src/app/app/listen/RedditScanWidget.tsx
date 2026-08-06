"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { useTRPC, type RouterOutputs } from "@/trpc/react";

import { ListenItemActions } from "@/components/listening/ListenItemActions";

type ScannedPost = RouterOutputs["reddit"]["scanNow"]["scored"][number];

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
  engage: { label: "ENGAGE", chip: "bg-emerald-500/15 text-emerald-400" },
  monitor: { label: "MONITOR", chip: "bg-amber-500/15 text-amber-400" },
  skip: { label: "SKIP", chip: "bg-muted text-muted-foreground" },
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

  const all = scan.data?.scored ?? [];
  const engage = all.filter((s) => s.suggestedAction === "engage");
  const monitor = all.filter((s) => s.suggestedAction === "monitor");
  const skipped = all.length - engage.length - monitor.length;

  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-foreground text-sm font-semibold">
            On-demand AI scoring
          </h4>
          <p className="text-muted-foreground mt-1 text-sm">
            Fetches the latest posts across the Tier 1 STR subs and runs them
            through Claude Sonnet 4.6 to surface engagement candidates.
          </p>
        </div>
        <button
          type="button"
          disabled={scan.isPending}
          onClick={() => scan.mutate()}
          className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {scan.isPending ? "Scanning…" : "Scan Reddit now"}
        </button>
      </div>

      {scan.isError && (
        <p className="bg-destructive/10 text-destructive mt-3 rounded-md px-3 py-2 text-sm">
          {scan.error.message}
        </p>
      )}

      {scan.data && (
        <p className="text-muted-foreground mt-3 text-xs">
          Scored {scan.data.totalFetched} posts · {engage.length} engage ·{" "}
          {monitor.length} monitor · {skipped} skip.
        </p>
      )}

      {engage.length > 0 && (
        <ScoredGroup label="Engage — act today" tone="engage" items={engage} />
      )}
      {monitor.length > 0 && (
        <ScoredGroup
          label="Monitor — revisit later"
          tone="monitor"
          items={monitor}
        />
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
  items: ScannedPost[];
}) {
  return (
    <div className="mt-5">
      <h5
        className={`text-xs font-semibold tracking-wide uppercase ${
          tone === "engage" ? "text-emerald-400" : "text-amber-400"
        }`}
      >
        {label} ({items.length})
      </h5>
      <ul className="mt-2 space-y-3">
        {items.map((s) => (
          <li key={s.post.id}>
            <ScoredPostCard scored={s} />
          </li>
        ))}
      </ul>
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

  const context = [
    "Help me write a reply to this Reddit post. Wander is a direct-booking platform for short-term-rental operators (WanderOS, Wander Sites, Wander Operated). Tone: warm, peer-to-peer, genuinely helpful, not a pitch. Disclose Wander affiliation. Keep it concise.",
    "",
    `Subreddit: r/${scored.post.subreddit}`,
    `Post: ${scored.post.title}`,
    `Intent: ${scored.intentTag} · relevance ${scored.relevance}/10`,
    `Why engage: ${scored.rationale}`,
    `Link: ${scored.post.url}`,
    pills.size ? `Style modifiers: ${Array.from(pills).join(", ")}` : null,
    customInstructions ? `Extra instructions: ${customInstructions}` : null,
    draft.data ? `\nCurrent draft to refine:\n${draft.data.draft}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <article className="bg-card rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 font-mono text-xs font-semibold ${style.chip}`}
        >
          {style.label}
        </span>
        <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 font-mono text-xs">
          {scored.relevance}/10
        </span>
        <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 font-mono text-xs">
          {scored.intentTag}
        </span>
        <span className="text-muted-foreground text-xs">
          r/{scored.post.subreddit} · {ageLabel(scored.post.createdUtc)} ·{" "}
          {scored.post.ups}↑ {scored.post.numComments}c
        </span>
      </div>

      <h3 className="text-foreground mt-2 text-sm font-semibold">
        <a
          href={scored.post.url}
          target="_blank"
          rel="noreferrer noopener"
          className="hover:text-primary"
        >
          {scored.post.title}
        </a>
      </h3>

      <p className="text-muted-foreground mt-2 text-sm">{scored.rationale}</p>

      <div className="bg-muted/40 mt-4 rounded-lg border border-dashed p-3">
        <p className="text-foreground text-xs font-semibold">Draft options</p>
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
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent"
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
          className="bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring mt-2 w-full rounded-md border px-2.5 py-1.5 text-xs focus:ring-1 focus:outline-none"
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
          className="bg-background text-foreground hover:bg-accent rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
          className="text-muted-foreground hover:text-primary text-xs"
        >
          Open on Reddit ↗
        </a>
      </div>

      <ListenItemActions context={context} />

      {draft.isError && (
        <p className="bg-destructive/10 text-destructive mt-3 rounded-md px-3 py-2 text-xs">
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
    <div className="bg-muted/40 mt-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-foreground text-xs font-semibold">Draft reply</p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(draft).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="text-muted-foreground hover:text-primary text-xs"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-foreground/90 mt-2 text-sm leading-relaxed whitespace-pre-wrap">
        {draft}
      </p>
      <p className="text-muted-foreground mt-3 text-xs">
        Draft only — review and edit before posting. Disclosure of Wander
        affiliation is intentional; do not remove.
      </p>
    </div>
  );
}
