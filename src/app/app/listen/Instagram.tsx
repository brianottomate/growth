"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, MessagesSquare, RefreshCw } from "lucide-react";

import { ListenItemActions } from "@/components/listening/ListenItemActions";
import {
  AssigneeButton,
  OwnerAvatar,
  type Member,
} from "@/components/assignment/assignee";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/server/better-auth/client";
import { orpc, type RouterOutputs } from "@/orpc/client";

import { SparPanel } from "./SparPanel";

type Mention = RouterOutputs["mention"]["list"]["mentions"][number];

// Instagram account-watch — a persisted queue off the `mention` store, fed by the
// daily account-watch scan (Bright Data → AI score + drafted comment). Same
// triage state machine as the Reddit room; the unit is "a post worth commenting
// on", faceted by the watched account rather than a subreddit.
const LIST_INPUT = {
  source: "instagram" as const,
  includeSkipped: true,
  limit: 300,
};

const INTENT_META: Record<
  string,
  { label: string; text: string; dot: string }
> = {
  "destination-match": {
    label: "Destination match",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  "audience-fit": {
    label: "Audience fit",
    text: "text-sky-400",
    dot: "bg-sky-400",
  },
  "brand-adjacent": {
    label: "Brand adjacent",
    text: "text-purple-400",
    dot: "bg-purple-400",
  },
  "off-topic": {
    label: "Off-topic",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

function intentMeta(tag: string | null | undefined) {
  if (!tag) return null;
  const key = tag.toLowerCase().replace(/\s+/g, "-");
  return (
    INTENT_META[key] ?? {
      label: tag,
      text: "text-muted-foreground",
      dot: "bg-muted-foreground",
    }
  );
}

function relTime(date: Date | string): string {
  const ms = Date.now() - new Date(date).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function Instagram() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery(
    orpc.mention.list.queryOptions({ input: LIST_INPUT }),
  );

  const [filter, setFilter] = useState<string | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const [justEngaged, setJustEngaged] = useState<Set<string>>(() => new Set());

  const invalidate = () =>
    void queryClient.invalidateQueries(
      orpc.mention.list.queryOptions({ input: LIST_INPUT }),
    );

  const setStatus = useMutation(
    orpc.mention.setStatus.mutationOptions({ onSuccess: invalidate }),
  );
  const assign = useMutation(
    orpc.mention.assign.mutationOptions({ onSuccess: invalidate }),
  );
  const scan = useMutation(
    orpc.listening.scanAccountWatch.mutationOptions({
      onSuccess: (r) => {
        invalidate();
        toast.success(
          `Scanned ${r.accounts} account(s): ${r.inserted} new (${r.engage} to act on)` +
            (r.errors.length ? ` · ${r.errors.length} error(s)` : ""),
        );
      },
      onError: (e) => toast.error(e.message || "Scan failed"),
    }),
  );

  const { data: members = [] } = useQuery(
    orpc.content.assignableMembers.queryOptions(),
  );
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user.id ?? "";

  const all = useMemo(() => data?.mentions ?? [], [data]);
  const accountCounts = useMemo(() => tally(all.map((m) => m.keyword)), [all]);

  if (isLoading) return <Skeleton />;
  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error.message}
      </div>
    );
  }

  const matches = (m: Mention) => !filter || m.keyword === filter;

  const open = all.filter(
    (m) =>
      m.status !== "skipped" &&
      (m.status !== "engaged" || justEngaged.has(m.id)) &&
      matches(m),
  );
  const act = open
    .filter((m) => m.suggestedAction === "engage")
    .sort(byRelevance);
  const monitor = open
    .filter((m) => m.suggestedAction !== "engage")
    .sort(byRelevance);
  const handled = all.filter(
    (m) => m.status === "engaged" && !justEngaged.has(m.id) && matches(m),
  );
  const skipped = all.filter((m) => m.status === "skipped" && matches(m));

  const lastReceived = all[0]?.receivedAt;

  const onState = (
    id: string,
    status: "engaged" | "skipped" | "new",
    reply?: { replyUrl: string | null; replyNote: string | null },
  ) => {
    setStatus.mutate({ id, status, ...reply });
    setJustEngaged((prev) => {
      const next = new Set(prev);
      if (status === "engaged") next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const onAssign = (id: string, userId: string | null) =>
    assign.mutate({ id, userId });

  const toggle = (v: string) => setFilter((prev) => (prev === v ? null : v));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Instagram — account watch
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Posts from the tastemaker / travel accounts we watch, scored for
            whether Wander&apos;s account should drop a clever public comment —
            each with a drafted suggestion. Scans daily; status sticks across
            reloads and teammates. Posting the comment stays manual.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastReceived && (
            <span className="text-xs text-muted-foreground">
              latest {relTime(lastReceived)} ago · {all.length} total
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={scan.isPending}
            onClick={() => scan.mutate({})}
          >
            {scan.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {scan.isPending ? "Scanning…" : "Scan now"}
          </Button>
        </div>
      </div>

      {all.length === 0 ? (
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          No Instagram posts yet. Add an account-watch source under{" "}
          <span className="font-medium">What we monitor</span> (e.g.{" "}
          <code className="font-mono">@whowhatwear</code>), then hit{" "}
          <span className="font-medium">Scan now</span> — relevant recent posts
          land here with a drafted comment.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 @2xl:grid-cols-[220px_1fr]">
          <aside className="space-y-5 @2xl:sticky @2xl:top-4 @2xl:self-start">
            <RailGroup
              title="Accounts"
              items={accountCounts}
              isActive={(v) => filter === v}
              onClick={toggle}
              render={(v) => `@${v}`}
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground/70">
              Click an account to filter. Comment while it&apos;s fresh — the
              suggested line is a starting point, edit before posting.
            </p>
          </aside>

          <div className="space-y-6">
            {filter && (
              <button
                onClick={() => setFilter(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Filtered by @{filter} — clear ✕
              </button>
            )}

            {act.length > 0 && (
              <QueueGroup label="Act today" count={act.length} tone="emerald">
                {act.map((m) => (
                  <IgCard
                    key={m.id}
                    m={m}
                    onState={onState}
                    pending={setStatus.isPending}
                    members={members}
                    currentUserId={currentUserId}
                    onAssign={onAssign}
                    onRefetch={invalidate}
                  />
                ))}
              </QueueGroup>
            )}
            {monitor.length > 0 && (
              <QueueGroup
                label="Monitor — revisit"
                count={monitor.length}
                tone="amber"
              >
                {monitor.map((m) => (
                  <IgCard
                    key={m.id}
                    m={m}
                    onState={onState}
                    pending={setStatus.isPending}
                    members={members}
                    currentUserId={currentUserId}
                    onAssign={onAssign}
                    onRefetch={invalidate}
                  />
                ))}
              </QueueGroup>
            )}
            {handled.length > 0 && (
              <QueueGroup label="Handled" count={handled.length} tone="muted">
                {handled.map((m) => (
                  <IgCard
                    key={m.id}
                    m={m}
                    onState={onState}
                    pending={setStatus.isPending}
                    members={members}
                    currentUserId={currentUserId}
                    onAssign={onAssign}
                    onRefetch={invalidate}
                  />
                ))}
              </QueueGroup>
            )}

            {skipped.length > 0 && (
              <div>
                <button
                  onClick={() => setShowSkipped((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {showSkipped ? "Hide" : "Show"} skipped ({skipped.length})
                </button>
                {showSkipped && (
                  <div className="mt-3">
                    <QueueGroup
                      label="Skipped"
                      count={skipped.length}
                      tone="muted"
                    >
                      {skipped.map((m) => (
                        <IgCard
                          key={m.id}
                          m={m}
                          onState={onState}
                          pending={setStatus.isPending}
                          members={members}
                          currentUserId={currentUserId}
                          onAssign={onAssign}
                          onRefetch={invalidate}
                        />
                      ))}
                    </QueueGroup>
                  </div>
                )}
              </div>
            )}

            {act.length + monitor.length + handled.length === 0 && (
              <p className="py-6 text-sm text-muted-foreground">
                Nothing in the queue for this filter.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- rail / group (local copies; kept tiny to leave Reddit.tsx untouched) ----

function RailGroup({
  title,
  items,
  isActive,
  onClick,
  render,
}: {
  title: string;
  items: { value: string; count: number }[];
  isActive: (v: string) => boolean;
  onClick: (v: string) => void;
  render: (v: string) => string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </span>
      <div className="flex flex-col gap-1.5">
        {items.map((it) => {
          const active = isActive(it.value);
          return (
            <button
              key={it.value}
              onClick={() => onClick(it.value)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
                active
                  ? "border-border bg-accent text-foreground"
                  : "border-border/60 bg-card text-muted-foreground hover:bg-accent/40",
              )}
            >
              <span className="truncate font-medium">{render(it.value)}</span>
              <span className="ml-auto text-muted-foreground/70 tabular-nums">
                {it.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function QueueGroup({
  label,
  count,
  tone,
  children,
}: {
  label: string;
  count: number;
  tone: "emerald" | "amber" | "muted";
  children: React.ReactNode;
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-400"
      : tone === "amber"
        ? "text-amber-400"
        : "text-muted-foreground";
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span
          className={cn(
            "text-xs font-semibold tracking-wide uppercase",
            toneCls,
          )}
        >
          {label}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {count}
        </span>
      </div>
      <div className="divide-y overflow-hidden rounded-xl border bg-card">
        {children}
      </div>
    </div>
  );
}

// ---- card -------------------------------------------------------------------

function IgCard({
  m,
  onState,
  pending,
  members,
  currentUserId,
  onAssign,
  onRefetch,
}: {
  m: Mention;
  onState: (
    id: string,
    status: "engaged" | "skipped" | "new",
    reply?: { replyUrl: string | null; replyNote: string | null },
  ) => void;
  pending: boolean;
  members: Member[];
  currentUserId: string;
  onAssign: (id: string, userId: string | null) => void;
  onRefetch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sparOpen, setSparOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const intent = intentMeta(m.intentTag);
  const handled = m.status === "engaged" || m.status === "skipped";
  const engaged = m.status === "engaged";
  const assignee = members.find((x) => x.id === m.assigneeId) ?? null;
  const resolver = members.find((x) => x.id === m.resolvedById) ?? null;

  const [editingReply, setEditingReply] = useState(false);
  const [replyUrl, setReplyUrl] = useState(m.replyUrl ?? "");
  const [replyNote, setReplyNote] = useState(m.replyNote ?? "");

  const markEngaged = () => {
    onState(m.id, "engaged");
    setEditingReply(true);
    setOpen(true);
  };
  const saveReply = () => {
    onState(m.id, "engaged", {
      replyUrl: replyUrl.trim() || null,
      replyNote: replyNote.trim() || null,
    });
    setEditingReply(false);
  };

  const copyComment = async () => {
    if (!m.suggestedReply) return;
    await navigator.clipboard.writeText(m.suggestedReply);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const when = m.postedAt ?? m.receivedAt;
  const meta = [m.author ? `@${m.author}` : null, `${relTime(when)} ago`]
    .filter(Boolean)
    .join(" · ");

  const context = [
    "Help me refine a short, clever PUBLIC comment for Wander's official Instagram account to leave on this third-party post (a tastemaker we admire — not our post). Tone: warm, witty, one sentence, no hard pitch, no links. Wander runs design-forward luxury vacation homes across many US destinations.",
    "",
    m.keyword ? `Account: @${m.keyword}` : null,
    m.relevance != null
      ? `Intent: ${m.intentTag} · relevance ${m.relevance}/10`
      : null,
    m.rationale ? `Why: ${m.rationale}` : null,
    `Caption: ${m.snippet ?? "(none)"}`,
    m.suggestedReply ? `Draft comment: ${m.suggestedReply}` : null,
    `Link: ${m.url}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className={cn("transition-opacity", handled && !open && "opacity-55")}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-accent/30"
      >
        <span className="flex flex-wrap items-center gap-2">
          {intent && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-current/40 px-2 py-0.5 text-[10px] font-medium",
                intent.text,
              )}
            >
              <span className={cn("size-1.5 rounded-full", intent.dot)} />
              {intent.label}
            </span>
          )}
          {m.relevance != null && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {m.relevance}/10
            </span>
          )}
          {m.suggestedReply && (
            <span className="text-[10px] font-medium text-violet-300">
              ✦ comment drafted
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            {assignee && <OwnerAvatar member={assignee} size="sm" />}
          </span>
        </span>

        <span className="text-sm leading-snug font-medium">
          {m.title ?? m.snippet ?? "(no caption)"}
        </span>
        {m.title && m.snippet && (
          <span
            className={cn(
              "text-xs leading-relaxed text-muted-foreground",
              !open && "line-clamp-2",
            )}
          >
            {m.snippet}
          </span>
        )}
        <span className="font-mono text-[11px] text-muted-foreground/80">
          {meta}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-2.5 px-4 pb-3">
          {m.rationale && (
            <p className="text-xs text-muted-foreground italic">
              {m.rationale}
            </p>
          )}

          {/* The deliverable: the drafted clever comment, copy-ready. */}
          {m.suggestedReply && (
            <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-violet-300">
                  ✦ Suggested comment
                </span>
                <button
                  type="button"
                  onClick={copyComment}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {copied ? (
                    <Check className="size-3" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed">
                {m.suggestedReply}
              </p>
            </div>
          )}

          {handled && (
            <p className="text-[11px] text-muted-foreground">
              {m.status === "engaged" ? "Engaged" : "Skipped"}
              {resolver ? ` by ${resolver.name ?? "someone"}` : ""}
              {m.resolvedAt ? ` · ${relTime(m.resolvedAt)} ago` : ""}
            </p>
          )}
          {m.decisionNote && (
            <p className="border-l-2 border-muted-foreground/30 pl-2 text-xs text-muted-foreground italic">
              {m.decisionNote}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {!handled ? (
              <>
                <Button size="sm" disabled={pending} onClick={markEngaged}>
                  Mark engaged
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => onState(m.id, "skipped")}
                >
                  Skip
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => onState(m.id, "new")}
              >
                Reopen
              </Button>
            )}
            <a
              href={m.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-muted-foreground hover:text-primary"
            >
              Open on Instagram ↗
            </a>
            <button
              type="button"
              onClick={() => setSparOpen(true)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              <MessagesSquare className="size-3.5" />
              Spar
            </button>
            {engaged &&
              (m.replyUrl ? (
                <a
                  href={m.replyUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                  title={m.replyNote ?? undefined}
                >
                  ✓ commented ↗
                </a>
              ) : (
                <span className="text-xs font-medium text-emerald-400">
                  ✓ engaged
                </span>
              ))}
            {engaged && (
              <button
                type="button"
                onClick={() => setEditingReply((v) => !v)}
                className="text-xs text-muted-foreground hover:text-primary"
              >
                {m.replyUrl ? "edit link" : "＋ comment link"}
              </button>
            )}
            <span className="ml-auto flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Owner</span>
              <AssigneeButton
                value={assignee}
                members={members}
                currentUserId={currentUserId}
                onChange={(userId) => onAssign(m.id, userId)}
                size="sm"
              />
            </span>
          </div>

          {editingReply && (
            <div className="flex flex-col gap-2 rounded-lg border bg-background/40 p-3">
              <input
                type="url"
                value={replyUrl}
                onChange={(e) => setReplyUrl(e.target.value)}
                placeholder="Permalink to our comment (optional)"
                className="w-full rounded-md border bg-background px-2 py-1 text-xs"
              />
              <input
                type="text"
                value={replyNote}
                onChange={(e) => setReplyNote(e.target.value)}
                placeholder="Note (optional) — e.g. commented from @wander"
                className="w-full rounded-md border bg-background px-2 py-1 text-xs"
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={pending} onClick={saveReply}>
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingReply(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <ListenItemActions
            context={context}
            mentionId={m.id}
            trackedLink={{ id: m.id, source: m.source, subreddit: m.subreddit }}
          />
        </div>
      )}

      {sparOpen && (
        <SparPanel
          mentionId={m.id}
          mentionTitle={m.title ?? m.snippet ?? "(untitled)"}
          open={sparOpen}
          onOpenChange={setSparOpen}
          onDecisionRecorded={onRefetch}
        />
      )}
    </div>
  );
}

// ---- helpers ----------------------------------------------------------------

function byRelevance(a: Mention, b: Mention) {
  return (b.relevance ?? -1) - (a.relevance ?? -1);
}

function tally(values: (string | null)[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

function Skeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
      Loading Instagram queue…
    </div>
  );
}
