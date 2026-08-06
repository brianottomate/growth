"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";

import { ListenItemActions } from "@/components/listening/ListenItemActions";
import { useTRPC, type RouterOutputs } from "@/trpc/react";
import type {
  ZernioConversation,
  ZernioMessage,
} from "@/server/clients/zernio.client";
import type { ConversationWithThread } from "./inbox-data";
import { conversationReplyUrl } from "./conversation-url";

type Scored = RouterOutputs["inbox"]["triageNow"]["scored"][number];
type ThreadMessage = ZernioMessage;

// How many trailing messages to show inline before "Show full thread".
const PREVIEW_MESSAGE_COUNT = 3;

// LinkedIn DMs aren't available via Zernio (or any API), so we just link out to
// the company admin inbox.
const LINKEDIN_INBOX_URL =
  "https://www.linkedin.com/company/78563329/admin/inbox/";

const PILLS = [
  { id: "short", label: "Short" },
  { id: "no-pitch", label: "No pitch" },
  { id: "lead-with-question", label: "Lead with question" },
  { id: "warm", label: "Warm" },
  { id: "focus-wanderos", label: "Focus: WanderOS" },
  { id: "focus-sites", label: "Focus: Sites" },
  { id: "focus-operated", label: "Focus: Operated" },
] as const;
type Pill = (typeof PILLS)[number]["id"];

const ACTION_STYLES: Record<
  Scored["suggestedAction"],
  { label: string; chip: string }
> = {
  engage: { label: "ENGAGE", chip: "bg-emerald-500/15 text-emerald-400" },
  monitor: { label: "MONITOR", chip: "bg-amber-500/15 text-amber-400" },
  skip: { label: "SKIP", chip: "bg-muted text-muted-foreground" },
};

function ageLabel(iso?: string): string {
  if (!iso) return "";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (Number.isNaN(minutes)) return "";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// Whether we owe a reply — derived from platform state, no persistence. If the
// last message is incoming, it's our turn. Preview-only cards (no thread
// prefetched, e.g. older X DMs) fall back to unread count.
function deriveNeedsReply(
  messages: ThreadMessage[],
  c: ZernioConversation,
): boolean {
  if (messages.length > 0) {
    return messages[messages.length - 1]?.direction === "incoming";
  }
  return (c.unreadCount ?? 0) > 0;
}

export function InboxClient({
  initialItems,
}: {
  initialItems: ConversationWithThread[];
}) {
  const trpc = useTRPC();
  const triage = useMutation(trpc.inbox.triageNow.mutationOptions());

  const scores = useMemo(() => {
    const m = new Map<string, Scored>();
    for (const s of triage.data?.scored ?? []) m.set(s.conversationId, s);
    return m;
  }, [triage.data]);

  // Pull in ALL conversations in the window (replied or not); flag which still
  // need a reply so we can lens + sort on it without dropping anything.
  const enriched = useMemo(
    () =>
      initialItems
        .filter((i) => typeof i.conversation.id === "string")
        .map((i) => ({
          ...i,
          needsReply: deriveNeedsReply(i.messages, i.conversation),
        })),
    [initialItems],
  );

  // Needs-reply first, then triage relevance. The relevance term is a no-op
  // until "Triage now" runs, so the stable sort preserves the loader's recency
  // order within each group.
  const items = useMemo(
    () =>
      [...enriched].sort((a, b) => {
        if (a.needsReply !== b.needsReply) return a.needsReply ? -1 : 1;
        return (
          (scores.get(b.conversation.id!)?.relevance ?? -1) -
          (scores.get(a.conversation.id!)?.relevance ?? -1)
        );
      }),
    [enriched, scores],
  );

  // Quick platform ("portal") filter — counts per platform present in the list.
  const platforms = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) {
      const p = i.conversation.platform ?? "other";
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const [platform, setPlatform] = useState<string>("all");
  const [needsReplyOnly, setNeedsReplyOnly] = useState(false);

  const needsReplyCount = useMemo(
    () => items.filter((i) => i.needsReply).length,
    [items],
  );

  const visibleItems = useMemo(() => {
    let list =
      platform === "all"
        ? items
        : items.filter(
            (i) => (i.conversation.platform ?? "other") === platform,
          );
    if (needsReplyOnly) list = list.filter((i) => i.needsReply);
    return list;
  }, [items, platform, needsReplyOnly]);

  const engage =
    triage.data?.scored.filter((s) => s.suggestedAction === "engage").length ??
    0;
  const monitor =
    triage.data?.scored.filter((s) => s.suggestedAction === "monitor").length ??
    0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-muted-foreground text-sm">
            {visibleItems.length} conversation
            {visibleItems.length === 1 ? "" : "s"}
            {platform !== "all" ? ` · ${platform}` : ""}
            {triage.data
              ? ` · triaged: ${engage} engage · ${monitor} monitor`
              : ""}
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
          <a
            href={LINKEDIN_INBOX_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground hover:text-primary text-xs"
          >
            LinkedIn DMs ↗
          </a>
        </div>
        <button
          type="button"
          disabled={triage.isPending}
          onClick={() => triage.mutate()}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {triage.isPending ? "Triaging…" : "Triage now"}
        </button>
      </div>

      {platforms.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {(
            [["all", items.length] as const] as ReadonlyArray<
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

      {triage.isError && (
        <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
          {triage.error.message}
        </p>
      )}

      {visibleItems.length === 0 ? (
        <div className="bg-card text-muted-foreground rounded-lg border p-4 text-sm">
          No conversations.
        </div>
      ) : (
        <ul className="space-y-3">
          {visibleItems.map((item) => (
            <li key={item.conversation.id}>
              <ConversationCard
                conversation={item.conversation}
                messages={item.messages}
                needsReply={item.needsReply}
                score={scores.get(item.conversation.id!)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConversationCard({
  conversation: c,
  messages,
  needsReply,
  score,
}: {
  conversation: ZernioConversation;
  messages: ThreadMessage[];
  needsReply: boolean;
  score?: Scored;
}) {
  const trpc = useTRPC();
  const [showFullThread, setShowFullThread] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [pills, setPills] = useState<Set<Pill>>(new Set());
  const [customInstructions, setCustomInstructions] = useState("");

  const draft = useMutation(trpc.inbox.draftReply.mutationOptions());

  // Thread is preloaded server-side — no fetch on the card. Show the last few
  // messages inline so the card is self-contained; expand for the full history.
  const hiddenCount = Math.max(0, messages.length - PREVIEW_MESSAGE_COUNT);
  const visibleMessages =
    showFullThread || hiddenCount === 0
      ? messages
      : messages.slice(-PREVIEW_MESSAGE_COUNT);

  const threadText = formatThread(messages, c);
  const context = buildContext(c, threadText);

  const togglePill = (id: Pill) =>
    setPills((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const style = score ? ACTION_STYLES[score.suggestedAction] : null;
  const followers = c.instagramProfile?.followerCount;
  const replyUrl = conversationReplyUrl(c);

  return (
    <article className="bg-card rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-foreground text-sm font-medium">
              {c.participantName ?? c.participantUsername ?? "Unknown"}
            </span>
            {c.participantUsername ? (
              <span className="text-muted-foreground text-xs">
                @{c.participantUsername}
              </span>
            ) : null}
            {c.instagramProfile?.isVerified ? (
              <BadgeCheck className="h-3.5 w-3.5 text-sky-400" />
            ) : null}
            {typeof followers === "number" ? (
              <span className="text-muted-foreground text-xs">
                ·{" "}
                {Intl.NumberFormat("en", { notation: "compact" }).format(
                  followers,
                )}{" "}
                followers
              </span>
            ) : null}
            <span className="text-muted-foreground text-xs">
              · {ageLabel(c.updatedTime)}
            </span>
            {needsReply ? (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-400">
                Needs reply
              </span>
            ) : null}
            {c.unreadCount ? (
              <span className="bg-primary/15 text-primary rounded px-1.5 py-0.5 text-xs">
                {c.unreadCount} unread
              </span>
            ) : null}
          </div>

          {style ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 font-mono text-xs font-semibold ${style.chip}`}
              >
                {style.label}
              </span>
              <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 font-mono text-xs">
                {score!.relevance}/10
              </span>
              <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 font-mono text-xs">
                {score!.intentTag}
              </span>
            </div>
          ) : null}

          {score?.rationale ? (
            <p className="text-muted-foreground mt-1 text-xs">
              {score.rationale}
            </p>
          ) : null}

          {messages.length === 0 ? (
            <p className="text-foreground/90 mt-1.5 text-sm">
              {(c.lastMessage ?? "").trim() || (
                <span className="text-muted-foreground italic">
                  (no preview)
                </span>
              )}
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {hiddenCount > 0 && !showFullThread ? (
                <button
                  type="button"
                  onClick={() => setShowFullThread(true)}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  Show {hiddenCount} earlier message
                  {hiddenCount === 1 ? "" : "s"}
                </button>
              ) : null}
              <ul className="space-y-2">
                {visibleMessages.map((m, i) => (
                  <MessageBubble key={m.id ?? i} message={m} />
                ))}
              </ul>
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setComposerOpen((v) => !v)}
              className="text-muted-foreground hover:text-foreground"
            >
              {composerOpen ? "Hide reply tools" : "Draft reply"}
            </button>
            {replyUrl ? (
              <a
                href={replyUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-muted-foreground hover:text-primary"
              >
                Reply on {c.platform ?? "platform"} ↗
              </a>
            ) : null}
          </div>
        </div>
        <span className="bg-muted text-muted-foreground shrink-0 rounded px-2 py-0.5 font-mono text-xs">
          {c.platform ?? "?"}
        </span>
      </div>

      {composerOpen ? (
        <div className="mt-3 border-t pt-3">
          <ListenItemActions context={context} />

          <div className="bg-muted/40 mt-3 rounded-lg border border-dashed p-3">
            <p className="text-foreground text-xs font-semibold">
              Draft a reply
            </p>
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
              onChange={(e) =>
                setCustomInstructions(e.target.value.slice(0, 500))
              }
              placeholder="Optional: extra instructions"
              rows={2}
              className="bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring mt-2 w-full rounded-md border px-2.5 py-1.5 text-xs focus:ring-1 focus:outline-none"
            />
            <button
              type="button"
              disabled={draft.isPending || messages.length === 0}
              onClick={() =>
                draft.mutate({
                  participantName: c.participantName,
                  platform: c.platform,
                  intentTag: score?.intentTag,
                  rationale: score?.rationale,
                  thread: threadText,
                  pills: Array.from(pills),
                  customInstructions: customInstructions.trim() || undefined,
                })
              }
              className="bg-background text-foreground hover:bg-accent mt-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {draft.isPending
                ? "Drafting…"
                : draft.data
                  ? "Regenerate draft"
                  : "Generate draft reply"}
            </button>

            {draft.isError && (
              <p className="bg-destructive/10 text-destructive mt-2 rounded-md px-3 py-2 text-xs">
                {draft.error.message}
              </p>
            )}
            {draft.data && <DraftBlock draft={draft.data.draft} />}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function MessageBubble({ message: m }: { message: ThreadMessage }) {
  const outgoing = m.direction === "outgoing";
  const text =
    (m.message ?? "").trim() ||
    (m.attachments && m.attachments.length > 0 ? "[attachment]" : "");
  return (
    <li className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm ${
          outgoing
            ? "bg-primary/15 text-foreground"
            : "bg-muted text-foreground/90"
        }`}
      >
        {!outgoing && m.senderName ? (
          <span className="text-muted-foreground mr-1 text-xs font-medium">
            {m.senderName}:
          </span>
        ) : null}
        {text || <span className="text-muted-foreground italic">(empty)</span>}
      </div>
    </li>
  );
}

function DraftBlock({ draft }: { draft: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bg-background mt-3 rounded-lg border p-3">
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
        Draft only — review and send from Zernio / the native app.
      </p>
    </div>
  );
}

function formatThread(
  messages: ThreadMessage[],
  c: ZernioConversation,
): string {
  return messages
    .map((m) => {
      const who =
        m.direction === "outgoing"
          ? `${c.accountUsername ? `@${c.accountUsername}` : "us"} (us)`
          : (m.senderName ?? c.participantName ?? "them");
      const text =
        (m.message ?? "").trim() ||
        (m.attachments && m.attachments.length > 0 ? "[attachment]" : "");
      return `${who}: ${text}`;
    })
    .join("\n");
}

function buildContext(c: ZernioConversation, threadText: string): string {
  const followers = c.instagramProfile?.followerCount;
  return [
    "Help me reply to this social DM. Wander is a direct-booking platform for short-term-rental operators (WanderOS, Wander Sites, Wander Operated). Tone: warm, human, concise; disclose Wander affiliation; never invent pricing/availability.",
    "",
    `Platform: ${c.platform ?? "instagram"} DM`,
    `From: ${c.participantName ?? "Unknown"}${c.participantUsername ? ` (@${c.participantUsername})` : ""}${c.instagramProfile?.isVerified ? ", verified" : ""}${typeof followers === "number" ? `, ${followers} followers` : ""}`,
    "",
    "Conversation (oldest first):",
    threadText || "(thread not loaded / attachment only)",
  ].join("\n");
}
