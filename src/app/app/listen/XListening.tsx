"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { toast } from "@/components/ui/toast";
import { matchWatchlist, X_WATCHLIST } from "@/lib/x-watchlist";
import { useTRPC, type RouterOutputs } from "@/trpc/react";

import { ListenItemActions } from "@/components/listening/ListenItemActions";

/**
 * X — listening: a dedicated room for the X channel. The watchlist rail is the
 * scan's actual driver made visible; tweets render as tweets with matched terms
 * highlighted and a velocity read; the composer enforces the 270-char cap with
 * the disclosure pills from the draft service. Queue states (Act today /
 * Monitor / Handled / Skipped) persist in localStorage — a filtered projection
 * of the same signal model as the rest of Listen, until the signal table lands.
 */

type ScannedTweet = RouterOutputs["twitter"]["scanNow"]["scored"][number];
type IntentTag = ScannedTweet["intentTag"];
type TweetState = "queued" | "engaged" | "skipped";

const STORAGE_KEY = "wander-x-listening-v1";

interface StoredScan {
  scannedAt: number;
  totalFetched: number;
  scored: ScannedTweet[];
  states: Record<string, TweetState>;
}

const INTENT_META: Record<
  IntentTag,
  { label: string; cls: string; dot: string }
> = {
  brand: {
    label: "Brand mention",
    cls: "border-emerald-500/45 text-emerald-400",
    dot: "bg-emerald-400",
  },
  "high-intent": {
    label: "High intent",
    cls: "border-emerald-500/45 text-emerald-400",
    dot: "bg-emerald-400",
  },
  "medium-intent": {
    label: "Medium intent",
    cls: "border-sky-500/45 text-sky-400",
    dot: "bg-sky-400",
  },
  positioning: {
    label: "Positioning",
    cls: "border-purple-500/45 text-purple-400",
    dot: "bg-purple-400",
  },
  "operator-pain": {
    label: "Operator pain",
    cls: "border-amber-500/45 text-amber-400",
    dot: "bg-amber-400",
  },
  noise: {
    label: "Noise",
    cls: "border-border text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

// The four disclosure/focus modifiers shown in the composer (a subset of the
// service's DRAFT_PILLS — the rest are reachable via custom instructions).
const COMPOSER_PILLS = [
  { id: "no-pitch", label: "No pitch" },
  { id: "focus-wanderos", label: "Focus WanderOS" },
  { id: "focus-sites", label: "Focus Sites" },
  { id: "focus-operated", label: "Focus Operated" },
] as const;

type ComposerPill = (typeof COMPOSER_PILLS)[number]["id"];

const DRAFT_CHAR_CAP = 270;

const compact = (n: number) =>
  new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(new Date()) - startOfDay(d)) / 86_400_000,
  );
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function relTime(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

// Engagement-per-hour read so the stream shows what's moving, not just totals.
function velocityOf(t: ScannedTweet["tweet"]): { label: string; cls: string } {
  const hours = Math.max(
    1,
    (Date.now() - new Date(t.createdAt).getTime()) / 3_600_000,
  );
  const score = (t.likeCount + 2 * t.retweetCount + t.replyCount) / hours;
  if (score >= 8)
    return { label: "↗ rising", cls: "text-amber-400 font-medium" };
  if (score >= 1) return { label: "→ steady", cls: "text-muted-foreground" };
  return { label: "· quiet", cls: "text-muted-foreground" };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function HighlightedText({
  text,
  terms,
  markClass,
}: {
  text: string;
  terms: string[];
  markClass: string;
}) {
  if (terms.length === 0) return <>{text}</>;
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  const lower = new Set(terms.map((t) => t.toLowerCase()));
  return (
    <>
      {text.split(pattern).map((part, i) =>
        lower.has(part.toLowerCase()) ? (
          <mark key={i} className={markClass}>
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function Btn({
  children,
  primary,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  primary?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function XListening() {
  const trpc = useTRPC();
  const scan = useMutation(trpc.twitter.scanNow.mutationOptions());

  const [stored, setStored] = useState<StoredScan | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setStored(JSON.parse(raw) as StoredScan);
    } catch {
      // corrupt cache — start fresh
    }
    setHydrated(true);
  }, []);

  const persist = (next: StoredScan) => {
    setStored(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage full/unavailable — state still lives in memory
    }
  };

  const runScan = () =>
    scan.mutate(undefined, {
      onSuccess: (data) => {
        // Carry over triage states for tweets that survive across scans;
        // auto-skip what the scorer marked as noise.
        const states: Record<string, TweetState> = {};
        for (const s of data.scored) {
          states[s.tweet.id] =
            stored?.states[s.tweet.id] ??
            (s.suggestedAction === "skip" ? "skipped" : "queued");
        }
        persist({
          scannedAt: Date.now(),
          totalFetched: data.totalFetched,
          scored: data.scored,
          states,
        });
      },
    });

  const setTweetState = (id: string, state: TweetState) => {
    if (!stored) return;
    persist({ ...stored, states: { ...stored.states, [id]: state } });
  };

  const enriched = useMemo(
    () =>
      (stored?.scored ?? []).map((s) => ({
        scored: s,
        match: matchWatchlist(s.tweet.text),
        state: stored?.states[s.tweet.id] ?? "queued",
      })),
    [stored],
  );

  const visible = enriched.filter(
    (e) =>
      (!filter || e.match?.group.id === filter) &&
      (e.state !== "skipped" || showSkipped),
  );
  const act = visible.filter(
    (e) => e.scored.suggestedAction === "engage" && e.state === "queued",
  );
  const monitor = visible.filter(
    (e) => e.scored.suggestedAction === "monitor" && e.state === "queued",
  );
  const handled = visible.filter((e) => e.state === "engaged");
  const skipped = visible.filter((e) => e.state === "skipped");
  const skippedTotal = enriched.filter((e) => e.state === "skipped").length;

  const aboveNoise = stored
    ? stored.scored.filter((s) => s.suggestedAction !== "skip").length
    : 0;

  const matchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of enriched) {
      if (e.match)
        counts[e.match.group.id] = (counts[e.match.group.id] ?? 0) + 1;
    }
    return counts;
  }, [enriched]);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            X — listening
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {stored
              ? `Last scan ${relTime(stored.scannedAt)} · 7-day window · ${stored.totalFetched} fetched → ${aboveNoise} above noise`
              : "No scan yet · 7-day window over the watchlist terms"}
          </p>
        </div>
        <button
          type="button"
          disabled={scan.isPending}
          onClick={runScan}
          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {scan.isPending ? "Scanning…" : "Scan now"}
        </button>
      </div>

      <p className="max-w-[760px] text-sm text-pretty text-muted-foreground">
        The X channel gets its own room: watchlist groups drive the scan,
        matched terms highlight in the tweet, velocity shows what&rsquo;s
        moving, and the composer enforces the 270-char cap with the disclosure
        pills from the draft service. States persist — same queue semantics as
        the rest of Listen.
      </p>

      {scan.isError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {scan.error.message}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[248px_1fr]">
        <div className="flex flex-col gap-2.5 lg:sticky lg:top-6">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Watchlist
          </span>
          {X_WATCHLIST.map((g) => {
            const active = filter === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setFilter(active ? null : g.id)}
                className={`flex flex-col gap-1.5 rounded-[10px] border p-3 text-left transition-colors ${
                  active
                    ? g.activeCardClass
                    : "bg-card hover:border-foreground/20"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${g.dotClass}`}
                  />
                  <span className="text-xs font-medium text-foreground">
                    {g.name}
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                    {matchCounts[g.id] ?? 0}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1">
                  {g.terms.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-muted px-1.5 py-px text-[11px] text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
          <span className="text-[11px] leading-relaxed text-muted-foreground">
            Terms kept aligned with the Reddit filter. Click a group to filter
            the stream; click again to clear.
          </span>
          {skippedTotal > 0 && (
            <button
              type="button"
              onClick={() => setShowSkipped((v) => !v)}
              className="self-start text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {showSkipped ? "Hide skipped" : `Show skipped (${skippedTotal})`}
            </button>
          )}
        </div>

        <div>
          {!hydrated ? null : !stored ? (
            <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
              Run a scan to pull the last 7 days of watchlist matches from X and
              score them for intent.
            </div>
          ) : (
            <>
              <QueueGroup label="Act today" count={act.length} emphasized>
                {act.map((e) => row(e))}
              </QueueGroup>
              <QueueGroup label="Monitor — revisit" count={monitor.length}>
                {monitor.map((e) => row(e))}
              </QueueGroup>
              <QueueGroup label="Handled" count={handled.length}>
                {handled.map((e) => row(e))}
              </QueueGroup>
              {showSkipped && (
                <QueueGroup label="Skipped" count={skipped.length}>
                  {skipped.map((e) => row(e))}
                </QueueGroup>
              )}
              {visible.length === 0 && (
                <p className="py-6 text-sm text-muted-foreground">
                  No tweets match this filter.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );

  function row(e: (typeof enriched)[number]) {
    return (
      <TweetCard
        key={e.scored.tweet.id}
        scored={e.scored}
        match={e.match}
        state={e.state}
        onState={(st) => setTweetState(e.scored.tweet.id, st)}
      />
    );
  }
}

function QueueGroup({
  label,
  count,
  emphasized,
  children,
}: {
  label: string;
  count: number;
  emphasized?: boolean;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-baseline gap-2">
        <span
          className={`text-xs font-semibold tracking-wide uppercase ${
            emphasized ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {count}
        </span>
      </div>
      <div className="divide-y rounded-xl border bg-card">{children}</div>
    </div>
  );
}

function TweetCard({
  scored,
  match,
  state,
  onState,
}: {
  scored: ScannedTweet;
  match: ReturnType<typeof matchWatchlist>;
  state: TweetState;
  onState: (state: TweetState) => void;
}) {
  const [open, setOpen] = useState(false);
  const t = scored.tweet;
  const intent = INTENT_META[scored.intentTag];
  const vel = velocityOf(t);
  const handled = state === "engaged" || state === "skipped";
  const initials = t.authorName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const context = [
    "Help me write a reply to this tweet. Wander is a direct-booking platform for short-term-rental operators (WanderOS, Wander Sites, Wander Operated). Tone: warm, peer-to-peer, genuinely helpful, not a pitch. Disclose Wander affiliation. Keep it under 270 characters.",
    "",
    `Author: @${t.authorUsername} (${compact(t.authorFollowers)} followers)`,
    `Tweet: ${t.text}`,
    `Intent: ${scored.intentTag} · relevance ${scored.relevance}/10`,
    `Why engage: ${scored.rationale}`,
    `Link: ${t.url}`,
  ].join("\n");

  return (
    <div className={`transition-opacity ${handled ? "opacity-55" : ""}`}>
      <div
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer gap-2.5 p-3.5"
      >
        <span className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
          {initials}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{t.authorName}</span>
            <span className="text-xs text-muted-foreground">
              @{t.authorUsername}
              {t.authorFollowers > 0 && (
                <> · {compact(t.authorFollowers)}</>
              )} ·{" "}
              {dayLabel(t.createdAt)}
            </span>
            <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-full border py-px pr-2 pl-1.5 text-[10px] font-medium ${intent.cls}`}
              >
                <span
                  className={`h-[5px] w-[5px] rounded-full ${intent.dot}`}
                />
                {intent.label}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {scored.relevance}/10
              </span>
            </span>
          </span>
          <span className="text-sm leading-normal">
            <HighlightedText
              text={t.text}
              terms={match?.terms ?? []}
              markClass={match?.group.markClass ?? ""}
            />
          </span>
          <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {t.replyCount} replies · {t.retweetCount} reposts · {t.likeCount}{" "}
              likes{t.viewCount > 0 && <> · {compact(t.viewCount)} views</>}
            </span>
            <span className={`text-[11px] ${vel.cls}`}>{vel.label}</span>
            {match && (
              <span className={`text-[11px] ${match.group.textClass}`}>
                ⌖ {match.group.name}
              </span>
            )}
          </span>
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-2.5 px-3.5 pb-3.5 pl-[54px]">
          <span className="text-xs text-muted-foreground italic">
            {scored.rationale}
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            {!handled ? (
              <>
                <Btn primary onClick={() => onState("engaged")}>
                  Mark engaged
                </Btn>
                <Btn onClick={() => onState("skipped")}>Skip</Btn>
              </>
            ) : (
              <Btn onClick={() => onState("queued")}>Reopen</Btn>
            )}
            <a
              href={t.url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              Open tweet ↗
            </a>
          </span>
          {scored.suggestedAction === "engage" && !handled && (
            <DraftComposer scored={scored} />
          )}
          <ListenItemActions context={context} />
        </div>
      )}
    </div>
  );
}

function DraftComposer({ scored }: { scored: ScannedTweet }) {
  const trpc = useTRPC();
  const draft = useMutation(trpc.twitter.draftReply.mutationOptions());
  const [pills, setPills] = useState<Set<ComposerPill>>(new Set());

  const togglePill = (id: ComposerPill) =>
    setPills((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const generate = () =>
    draft.mutate({
      tweet: {
        id: scored.tweet.id,
        text: scored.tweet.text,
        authorUsername: scored.tweet.authorUsername,
        authorName: scored.tweet.authorName,
        url: scored.tweet.url,
        createdAt: scored.tweet.createdAt,
        likeCount: scored.tweet.likeCount,
        replyCount: scored.tweet.replyCount,
        retweetCount: scored.tweet.retweetCount,
      },
      intentTag: scored.intentTag,
      rationale: scored.rationale,
      pills: Array.from(pills),
    });

  const text = draft.data?.draft ?? "";
  const over = text.length > DRAFT_CHAR_CAP;

  const copyReply = () => {
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Reply copied"))
      .catch(() => toast.error("Couldn't copy to clipboard"));
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="flex flex-col gap-2 rounded-[10px] bg-muted/60 p-3"
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Draft · Claude
        </span>
        {COMPOSER_PILLS.map((p) => {
          const on = pills.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => togglePill(p.id)}
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          );
        })}
        {text && (
          <span
            className={`ml-auto shrink-0 text-[10px] tabular-nums ${
              over ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {text.length}/{DRAFT_CHAR_CAP}
          </span>
        )}
      </span>

      {draft.isError && (
        <span className="text-xs text-destructive">{draft.error.message}</span>
      )}
      {text && <span className="text-xs leading-relaxed">{text}</span>}

      <span className="flex gap-1.5">
        {text && (
          <Btn primary onClick={copyReply}>
            Copy reply
          </Btn>
        )}
        <Btn disabled={draft.isPending} onClick={generate}>
          {draft.isPending
            ? "Drafting…"
            : text
              ? "Regenerate"
              : "Generate draft"}
        </Btn>
      </span>
    </div>
  );
}
