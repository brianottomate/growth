"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Copy,
  Handshake,
  RotateCcw,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import { useTRPC, type RouterOutputs } from "@/trpc/react";

type AffiliateItem = RouterOutputs["affiliate"]["list"]["items"][number];

// Affiliate ops desk v1 — the inbound-email triage queue. Items land here from
// the partnerships@ forward (Resend webhook → affiliate-inbound.service), get
// AI-scored + reply-drafted, and the team resolves them (the Slack broadcast is
// the ping; THIS is where dispositions are recorded, per house policy).

const INTENT_META: Record<
  string,
  { label: string; text: string; dot: string }
> = {
  "partner-question": {
    label: "Partner question",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  application: {
    label: "Application",
    text: "text-sky-400",
    dot: "bg-sky-400",
  },
  "placement-offer": {
    label: "Placement offer",
    text: "text-purple-400",
    dot: "bg-purple-400",
  },
  "recruitment-pitch": {
    label: "Recruitment pitch",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  "network-notice": {
    label: "Network notice",
    text: "text-amber-400",
    dot: "bg-amber-400",
  },
  compliance: { label: "Compliance", text: "text-red-400", dot: "bg-red-400" },
  "fraud-signal": {
    label: "Fraud signal",
    text: "text-red-400",
    dot: "bg-red-400",
  },
  noise: {
    label: "Noise",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

function intentMeta(tag: string | null | undefined) {
  if (!tag) return null;
  return (
    INTENT_META[tag] ?? {
      label: tag,
      text: "text-muted-foreground",
      dot: "bg-muted-foreground",
    }
  );
}

function relTime(date: Date | string | null): string {
  if (!date) return "";
  const ms = Date.now() - new Date(date).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const LIST_INPUT = { includeDismissed: true, limit: 300 } as const;

export function AffiliateDesk() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(
    trpc.affiliate.list.queryOptions(LIST_INPUT),
  );

  const setStatus = useMutation(
    trpc.affiliate.setStatus.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.affiliate.list.queryOptions(LIST_INPUT),
        );
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const items = useMemo(() => data?.items ?? [], [data]);
  const buckets = useMemo(() => {
    const open = items.filter((i) => i.status === "open");
    const handled = items.filter((i) => i.status === "handled");
    const dismissed = items.filter((i) => i.status === "dismissed");
    return { open, handled, dismissed };
  }, [items]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <Handshake className="text-muted-foreground size-6" />
        <div>
          <h1 className="text-lg font-semibold">Affiliate desk</h1>
          <p className="text-muted-foreground text-sm">
            Inbound program mail, AI-triaged. Resolve here — the Slack ping is
            only the doorbell.
          </p>
        </div>
      </header>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing yet. Items appear when partner mail hits the partnerships@
          forward.
        </p>
      ) : (
        <>
          <Section
            title={`Open (${buckets.open.length})`}
            items={buckets.open}
            setStatus={setStatus.mutate}
          />
          <Section
            title={`Handled (${buckets.handled.length})`}
            items={buckets.handled}
            setStatus={setStatus.mutate}
            collapsed
          />
          <Section
            title={`Dismissed (${buckets.dismissed.length})`}
            items={buckets.dismissed}
            setStatus={setStatus.mutate}
            collapsed
          />
        </>
      )}
    </div>
  );
}

function Section({
  title,
  items,
  setStatus,
  collapsed = false,
}: {
  title: string;
  items: AffiliateItem[];
  setStatus: (input: {
    id: string;
    status: "open" | "handled" | "dismissed";
    replyNote?: string | null;
  }) => void;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(!collapsed);
  if (items.length === 0 && collapsed) return null;

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-muted-foreground flex items-center gap-1 text-left text-sm font-medium"
      >
        <ChevronDown
          className={cn("size-4 transition-transform", !open && "-rotate-90")}
        />
        {title}
      </button>
      {open &&
        items.map((item) => (
          <ItemCard key={item.id} item={item} setStatus={setStatus} />
        ))}
    </section>
  );
}

function ItemCard({
  item,
  setStatus,
}: {
  item: AffiliateItem;
  setStatus: (input: {
    id: string;
    status: "open" | "handled" | "dismissed";
    replyNote?: string | null;
  }) => void;
}) {
  const [showReply, setShowReply] = useState(false);
  const meta = intentMeta(item.intentTag);

  return (
    <div className="bg-card rounded-lg border p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            {meta && (
              <span className={cn("inline-flex items-center gap-1", meta.text)}>
                <span className={cn("size-1.5 rounded-full", meta.dot)} />
                {meta.label}
              </span>
            )}
            {typeof item.relevance === "number" && (
              <span>{item.relevance}/10</span>
            )}
            <span>{relTime(item.receivedAt ?? item.createdAt)}</span>
          </div>
          <p className="mt-1 truncate font-medium">
            {item.title ?? "(untitled)"}
          </p>
          {item.fromEmail && (
            <p className="text-muted-foreground truncate text-xs">
              {item.fromName ? `${item.fromName} · ` : ""}
              {item.fromEmail}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {item.status === "open" ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStatus({ id: item.id, status: "handled" })}
              >
                <Check className="size-3.5" /> Handled
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStatus({ id: item.id, status: "dismissed" })}
              >
                <X className="size-3.5" />
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setStatus({ id: item.id, status: "open" })}
            >
              <RotateCcw className="size-3.5" /> Reopen
            </Button>
          )}
        </div>
      </div>

      {item.snippet && (
        <p className="text-muted-foreground mt-2 line-clamp-3">
          {item.snippet}
        </p>
      )}
      {item.rationale && (
        <p className="text-muted-foreground mt-2 text-xs italic">
          {item.rationale}
        </p>
      )}

      {item.suggestedReply && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowReply((v) => !v)}
            className="text-muted-foreground flex items-center gap-1 text-xs font-medium"
          >
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                !showReply && "-rotate-90",
              )}
            />
            Suggested reply
          </button>
          {showReply && (
            <div className="bg-muted/40 mt-1 rounded-md border p-3">
              <p className="text-sm whitespace-pre-wrap">
                {item.suggestedReply}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => {
                  void navigator.clipboard.writeText(item.suggestedReply ?? "");
                  toast.success(
                    "Reply copied — send it from the partnerships inbox",
                  );
                }}
              >
                <Copy className="size-3.5" /> Copy
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
