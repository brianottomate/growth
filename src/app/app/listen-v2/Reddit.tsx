"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";

import { ListenItemActions } from "@/app/app/listen/ListenItemActions";
import {
  AssigneeButton,
  OwnerAvatar,
  type Member,
} from "@/components/assignment/assignee";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/lib/utils";
import { authClient } from "@/server/better-auth/client";
import { useTRPC, type RouterOutputs } from "@/trpc/react";

type Mention = RouterOutputs["mention"]["list"]["mentions"][number];

// Reddit listening — a persisted queue off the `mention` store. F5Bot is today's
// only source (provenance = provider); other sources can feed the same queue
// later. The unit we persist is "a Reddit listening item", not "an F5Bot email".
const LIST_INPUT = {
  source: "reddit" as const,
  includeSkipped: true,
  limit: 300,
};

// Intent taxonomy → colour. Tolerant: unknown tags render muted.
const INTENT_META: Record<string, { label: string; text: string; dot: string }> = {
  brand: { label: "Brand", text: "text-emerald-400", dot: "bg-emerald-400" },
  "brand-critical": { label: "Brand critical", text: "text-red-400", dot: "bg-red-400" },
  "high-intent": { label: "High intent", text: "text-emerald-400", dot: "bg-emerald-400" },
  "medium-intent": { label: "Medium intent", text: "text-sky-400", dot: "bg-sky-400" },
  positioning: { label: "Positioning", text: "text-purple-400", dot: "bg-purple-400" },
  "operator-pain": { label: "Operator pain", text: "text-amber-400", dot: "bg-amber-400" },
  noise: { label: "Noise", text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

function intentMeta(tag: string | null | undefined) {
  if (!tag) return null;
  const key = tag.toLowerCase().replace(/\s+/g, "-");
  return (
    INTENT_META[key] ?? { label: tag, text: "text-muted-foreground", dot: "bg-muted-foreground" }
  );
}

const PROVIDER_LABEL: Record<string, string> = { f5bot: "F5Bot" };

function relTime(date: Date | string): string {
  const ms = Date.now() - new Date(date).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

type Filter = { type: "sub" | "term"; value: string } | null;

export function Reddit() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery(
    trpc.mention.list.queryOptions(LIST_INPUT),
  );

  const [filter, setFilter] = useState<Filter>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  const setStatus = useMutation(
    trpc.mention.setStatus.mutationOptions({
      onSuccess: () =>
        void queryClient.invalidateQueries(
          trpc.mention.list.queryOptions(LIST_INPUT),
        ),
    }),
  );
  const assign = useMutation(
    trpc.mention.assign.mutationOptions({
      onSuccess: () =>
        void queryClient.invalidateQueries(
          trpc.mention.list.queryOptions(LIST_INPUT),
        ),
    }),
  );

  // Reuse the content org-member list + Better Auth session for claiming.
  const { data: members = [] } = useQuery(
    trpc.content.assignableMembers.queryOptions(),
  );
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user.id ?? "";

  const all = useMemo(() => data?.mentions ?? [], [data]);

  // Rail facets — derived from the data so they always reflect the real queue.
  const subCounts = useMemo(() => tally(all.map((m) => m.subreddit)), [all]);
  const termCounts = useMemo(() => tally(all.map((m) => m.keyword)), [all]);

  if (isLoading) return <Skeleton />;
  if (isError) {
    return (
      <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
        {error.message}
      </div>
    );
  }

  if (all.length === 0) {
    return (
      <div className="bg-card text-muted-foreground rounded-lg border p-4 text-sm">
        No Reddit mentions yet. Once F5Bot alerts are forwarded to{" "}
        <code className="font-mono">f5bot@lexaomo.resend.app</code>, the Reddit
        ones land here — extracted, scored, and persisted.
      </div>
    );
  }

  const matches = (m: Mention) =>
    !filter ||
    (filter.type === "sub" ? m.subreddit === filter.value : m.keyword === filter.value);

  const open = all.filter((m) => m.status !== "skipped" && m.status !== "engaged" && matches(m));
  const act = open
    .filter((m) => m.suggestedAction === "engage")
    .sort(byRelevance);
  const monitor = open
    .filter((m) => m.suggestedAction !== "engage")
    .sort(byRelevance);
  const handled = all.filter((m) => m.status === "engaged" && matches(m));
  const skipped = all.filter((m) => m.status === "skipped" && matches(m));

  const lastReceived = all[0]?.receivedAt;
  const onState = (id: string, status: "engaged" | "skipped" | "new") =>
    setStatus.mutate({ id, status });
  const onAssign = (id: string, userId: string | null) =>
    assign.mutate({ id, userId });

  const toggle = (f: Filter) =>
    setFilter((prev) =>
      prev && f && prev.type === f.type && prev.value === f.value ? null : f,
    );

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Reddit — listening</h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            One persisted queue of Reddit signal. F5Bot forwards keyword matches
            (posts <em>and</em> comments) — they&apos;re scored, deduped, and
            triaged here; status sticks across reloads and teammates.
          </p>
        </div>
        {lastReceived && (
          <span className="text-muted-foreground text-xs">
            latest {relTime(lastReceived)} ago · {all.length} total
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[220px_1fr]">
        {/* rail */}
        <aside className="space-y-5 md:sticky md:top-4 md:self-start">
          <RailGroup
            title="Subreddits"
            items={subCounts}
            isActive={(v) => filter?.type === "sub" && filter.value === v}
            onClick={(v) => toggle({ type: "sub", value: v })}
            render={(v) => `r/${v}`}
          />
          <RailGroup
            title="Alert terms · F5Bot"
            items={termCounts}
            isActive={(v) => filter?.type === "term" && filter.value === v}
            onClick={(v) => toggle({ type: "term", value: v })}
            render={(v) => `“${v}”`}
          />
          <p className="text-muted-foreground/70 text-[11px] leading-relaxed">
            Click a subreddit or term to filter the queue. F5Bot also catches
            comments, not just posts.
          </p>
        </aside>

        {/* queue */}
        <div className="space-y-6">
          {filter && (
            <button
              onClick={() => setFilter(null)}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Filtered by {filter.type === "sub" ? `r/${filter.value}` : `“${filter.value}”`} — clear ✕
            </button>
          )}

          {act.length > 0 && (
            <QueueGroup label="Act today" count={act.length} tone="emerald">
              {act.map((m) => (
                <RedditCard key={m.id} m={m} onState={onState} pending={setStatus.isPending} members={members} currentUserId={currentUserId} onAssign={onAssign} />
              ))}
            </QueueGroup>
          )}
          {monitor.length > 0 && (
            <QueueGroup label="Monitor — revisit" count={monitor.length} tone="amber">
              {monitor.map((m) => (
                <RedditCard key={m.id} m={m} onState={onState} pending={setStatus.isPending} members={members} currentUserId={currentUserId} onAssign={onAssign} />
              ))}
            </QueueGroup>
          )}
          {handled.length > 0 && (
            <QueueGroup label="Handled" count={handled.length} tone="muted">
              {handled.map((m) => (
                <RedditCard key={m.id} m={m} onState={onState} pending={setStatus.isPending} members={members} currentUserId={currentUserId} onAssign={onAssign} />
              ))}
            </QueueGroup>
          )}

          {skipped.length > 0 && (
            <div>
              <button
                onClick={() => setShowSkipped((v) => !v)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                {showSkipped ? "Hide" : "Show"} skipped ({skipped.length})
              </button>
              {showSkipped && (
                <div className="mt-3">
                  <QueueGroup label="Skipped" count={skipped.length} tone="muted">
                    {skipped.map((m) => (
                      <RedditCard key={m.id} m={m} onState={onState} pending={setStatus.isPending} members={members} currentUserId={currentUserId} onAssign={onAssign} />
                    ))}
                  </QueueGroup>
                </div>
              )}
            </div>
          )}

          {act.length + monitor.length + handled.length === 0 && (
            <p className="text-muted-foreground py-6 text-sm">
              Nothing in the queue for this filter.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- rail ------------------------------------------------------------------

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
      <span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
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
              <span className="text-muted-foreground/70 ml-auto tabular-nums">
                {it.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- queue group -----------------------------------------------------------

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
        <span className={cn("text-xs font-semibold tracking-wide uppercase", toneCls)}>
          {label}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
      </div>
      <div className="bg-card divide-y overflow-hidden rounded-xl border">
        {children}
      </div>
    </div>
  );
}

// ---- card ------------------------------------------------------------------

function RedditCard({
  m,
  onState,
  pending,
  members,
  currentUserId,
  onAssign,
}: {
  m: Mention;
  onState: (id: string, status: "engaged" | "skipped" | "new") => void;
  pending: boolean;
  members: Member[];
  currentUserId: string;
  onAssign: (id: string, userId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const intent = intentMeta(m.intentTag);
  const handled = m.status === "engaged" || m.status === "skipped";
  const assignee = members.find((x) => x.id === m.assigneeId) ?? null;
  const resolver = members.find((x) => x.id === m.resolvedById) ?? null;

  const provLabel = PROVIDER_LABEL[m.provider] ?? m.provider;
  const provDetail = m.keyword
    ? `“${m.keyword}”${m.sourceType ? ` in ${m.sourceType}` : ""}`
    : m.sourceType ?? null;

  const meta = [
    m.subreddit ? `r/${m.subreddit}` : null,
    m.author,
    `${relTime(m.receivedAt)} ago`,
  ]
    .filter(Boolean)
    .join(" · ");

  const context = [
    "Help me write a reply to this Reddit mention. Wander is a direct-booking platform for short-term-rental operators (WanderOS, Wander Sites, Wander Operated). Tone: warm, peer-to-peer, genuinely helpful, not a pitch. Disclose Wander affiliation. Keep it concise.",
    "",
    m.subreddit ? `Subreddit: r/${m.subreddit}` : null,
    m.keyword ? `Matched keyword: ${m.keyword}` : null,
    m.title ? `Title: ${m.title}` : null,
    m.author ? `Author: ${m.author}` : null,
    m.relevance != null ? `Intent: ${m.intentTag} · relevance ${m.relevance}/10` : null,
    m.rationale ? `Why: ${m.rationale}` : null,
    `Text: ${m.snippet ?? "(none)"}`,
    `Link: ${m.url}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className={cn("transition-opacity", handled && "opacity-55")}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-accent/30 flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors"
      >
        <span className="flex flex-wrap items-center gap-2">
          {intent && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                "border-current/40",
                intent.text,
              )}
            >
              <span className={cn("size-1.5 rounded-full", intent.dot)} />
              {intent.label}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-300">
            <span className="size-1.5 rounded-full bg-purple-400" />
            {provLabel}
            {provDetail ? ` · ${provDetail}` : ""}
          </span>
          {m.relevance != null && (
            <span className="text-muted-foreground text-[10px] tabular-nums">
              {m.relevance}/10
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            {assignee && <OwnerAvatar member={assignee} size="sm" />}
            {m.sourceType === "comment" && (
              <span className="text-muted-foreground text-[10px]">comment</span>
            )}
            <ChevronDown
              className={cn(
                "text-muted-foreground size-3.5 transition-transform",
                open && "rotate-180",
              )}
            />
          </span>
        </span>

        <span className="text-sm leading-snug font-medium">
          {m.title ?? m.snippet ?? "(untitled)"}
        </span>
        {m.title && m.snippet && (
          <span
            className={cn(
              "text-muted-foreground text-xs leading-relaxed",
              !open && "line-clamp-2",
            )}
          >
            {m.snippet}
          </span>
        )}
        <span className="text-muted-foreground/80 font-mono text-[11px]">{meta}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-2.5 px-4 pb-3">
          {m.rationale && (
            <p className="text-muted-foreground text-xs italic">{m.rationale}</p>
          )}
          {handled && (
            <p className="text-muted-foreground text-[11px]">
              {m.status === "engaged" ? "Engaged" : "Skipped"}
              {resolver ? ` by ${resolver.name ?? "someone"}` : ""}
              {m.resolvedAt ? ` · ${relTime(m.resolvedAt)} ago` : ""}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!handled ? (
              <>
                <Button size="sm" disabled={pending} onClick={() => onState(m.id, "engaged")}>
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
              className="text-muted-foreground hover:text-primary text-xs"
            >
              Open on Reddit ↗
            </a>
            <span className="ml-auto flex items-center gap-1.5">
              <span className="text-muted-foreground text-[11px]">Owner</span>
              <AssigneeButton
                value={assignee}
                members={members}
                currentUserId={currentUserId}
                onChange={(userId) => onAssign(m.id, userId)}
                size="sm"
              />
            </span>
          </div>
          <ListenItemActions context={context} />
        </div>
      )}
    </div>
  );
}

// ---- helpers ---------------------------------------------------------------

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
    <div className="bg-card text-muted-foreground rounded-lg border p-4 text-sm">
      Loading Reddit queue…
    </div>
  );
}
