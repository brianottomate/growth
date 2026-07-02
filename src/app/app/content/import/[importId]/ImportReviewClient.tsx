"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Pencil, X } from "lucide-react";

import { useTRPC } from "@/trpc/react";
import type { RouterOutputs } from "@/trpc/react";
import { ChannelLogo } from "@/components/channel-logos";
import { toast } from "@/components/ui/toast";
import { cn } from "@/components/ui/lib/utils";
import { PILLAR_BY_SLUG } from "@/lib/pillars";

type ImportData = RouterOutputs["planImport"]["get"];
type Item = ImportData["items"][number];
type ItemStatus = Item["status"];

const BULK_THRESHOLD = 0.75;

const scoreTint = (s: number) =>
  s >= 0.75
    ? "border-emerald-500/40 text-emerald-400"
    : s >= 0.5
      ? "border-sky-500/40 text-sky-400"
      : "border-amber-500/40 text-amber-400";

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(`${iso}T12:00:00`).toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "Undated";

/** Review a pasted month workbook: per-idea decisions persist as you go;
 *  nothing touches the calendar until the single "Apply" moment. */
export function ImportReviewClient({ importId }: { importId: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();

  const getOpts = trpc.planImport.get.queryOptions({ importId });
  const { data, isLoading } = useQuery(getOpts);
  const invalidate = () => qc.invalidateQueries({ queryKey: getOpts.queryKey });

  // Optimistic decisions (GroupingsClient pattern) — reverted on error.
  const [resolved, setResolved] = useState<Record<string, ItemStatus>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const setStatus = useMutation(
    trpc.planImport.setItemStatus.mutationOptions({
      onError: (e, vars) => {
        setResolved((prev) => {
          const next = { ...prev };
          for (const id of vars.itemIds) delete next[id];
          return next;
        });
        toast.error(e.message);
      },
    }),
  );

  const apply = useMutation(
    trpc.planImport.applyImport.mutationOptions({
      onSuccess: (res) => {
        if (res.failed.length) {
          toast.error(
            `Applied ${res.applied}, but ${res.failed.length} failed — see rows`,
          );
        } else {
          toast.success(
            `Applied ${res.applied} ideas (${res.slotsConsumed} slots filled, ${res.created} new)`,
          );
        }
        setResolved({});
        void invalidate();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const effectiveStatus = (item: Item): ItemStatus =>
    resolved[item.id] ?? item.status;

  const decide = (item: Item, status: ItemStatus) => {
    // Clicking the active decision again returns the item to pending.
    const next = effectiveStatus(item) === status ? "pending" : status;
    setResolved((prev) => ({ ...prev, [item.id]: next }));
    setStatus.mutate({ itemIds: [item.id], status: next });
  };

  const items = useMemo(() => data?.items ?? [], [data]);
  const tally = useMemo(() => {
    const t = { pending: 0, accepted: 0, accepted_refine: 0, rejected: 0 };
    for (const it of items) t[effectiveStatus(it)]++;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, resolved]);

  const applied = items.filter((i) => i.appliedContentPostId).length;
  const applicable = items.filter(
    (i) =>
      !i.appliedContentPostId &&
      (effectiveStatus(i) === "accepted" || effectiveStatus(i) === "accepted_refine"),
  ).length;
  const bulkTargets = items.filter(
    (i) =>
      !i.appliedContentPostId &&
      effectiveStatus(i) === "pending" &&
      (i.confidence ?? 0) >= BULK_THRESHOLD,
  );

  const bulkAccept = () => {
    if (!bulkTargets.length) return;
    const ids = bulkTargets.map((i) => i.id);
    setResolved((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = "accepted";
      return next;
    });
    setStatus.mutate({ itemIds: ids, status: "accepted" });
  };

  // Gaps rail: a slot is spoken-for when its consuming item is (optimistically)
  // accepted, or the slot was already materialized by a previous apply.
  const slots = data?.slots ?? [];
  const consumingStatus = new Map(items.map((i) => [i.id, effectiveStatus(i)]));
  const isConsumed = (s: ImportData["slots"][number]) => {
    if (!s.consumedByItemId) return false;
    const item = items.find((i) => i.id === s.consumedByItemId);
    if (item?.appliedContentPostId) return true;
    const st = consumingStatus.get(s.consumedByItemId);
    return st === "accepted" || st === "accepted_refine";
  };
  const slotsByPlatform = useMemo(() => {
    const m = new Map<string, ImportData["slots"]>();
    for (const s of slots)
      (m.get(s.platform) ?? m.set(s.platform, []).get(s.platform)!).push(s);
    return [...m.entries()].sort();
  }, [slots]);
  const consumedCount = slots.filter(isConsumed).length;

  if (isLoading || !data) {
    return <div className="text-muted-foreground p-8 text-sm">Loading import…</div>;
  }

  const imp = data.import;

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href="/app/content"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" /> Content
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">
          Plan import · {imp.month}
        </h1>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-medium",
            imp.status === "applied"
              ? "border-emerald-500/40 text-emerald-400"
              : imp.status === "failed"
                ? "border-rose-500/40 text-rose-400"
                : "border-border text-muted-foreground",
          )}
        >
          {imp.status}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {items.length} ideas · {tally.accepted} ✓ · {tally.accepted_refine} ✓✎ ·{" "}
          {tally.rejected} ✕ · {tally.pending} pending
          {applied > 0 ? ` · ${applied} applied` : ""}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {bulkTargets.length > 0 && (
            <button
              onClick={bulkAccept}
              className="border-border hover:bg-accent rounded-full border px-3 py-1.5 text-xs font-medium"
            >
              Accept {bulkTargets.length} high-confidence
            </button>
          )}
          <button
            onClick={() => apply.mutate({ importId })}
            disabled={applicable === 0 || apply.isPending}
            className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {apply.isPending ? "Applying…" : `Apply ${applicable} accepted`}
          </button>
        </div>
      </div>

      {imp.status === "failed" && (
        <div className="mb-4 rounded-xl border border-rose-500/40 px-4 py-3 text-sm text-rose-400">
          Parse failed: {imp.error}
        </div>
      )}

      <div className="flex items-start gap-5">
        {/* Items */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border">
          {items.map((item) => {
            const st = effectiveStatus(item);
            const idea = item.payload;
            const isApplied = !!item.appliedContentPostId;
            const isOpen = expanded === item.id;
            return (
              <div key={item.id} className="border-b last:border-b-0">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpanded(isOpen ? null : item.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setExpanded(isOpen ? null : item.id);
                  }}
                  className={cn(
                    "hover:bg-accent/40 flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5",
                    st === "rejected" && "opacity-45",
                  )}
                >
                  <span className="text-muted-foreground w-20 shrink-0 text-xs tabular-nums">
                    {fmtDate(idea.date)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {idea.title}
                      </span>
                      {idea.pillar && PILLAR_BY_SLUG[idea.pillar] && (
                        <span
                          className="hidden shrink-0 items-center gap-1 text-[11px] sm:flex"
                          style={{ color: PILLAR_BY_SLUG[idea.pillar]!.color }}
                        >
                          ● {PILLAR_BY_SLUG[idea.pillar]!.name}
                        </span>
                      )}
                      {idea.seriesName && (
                        <span className="bg-muted text-muted-foreground hidden shrink-0 rounded-full px-1.5 py-0.5 text-[10px] sm:inline">
                          {idea.seriesName}
                        </span>
                      )}
                      {idea.duplicateOfContentPostId && (
                        <span className="shrink-0 rounded-full border border-amber-500/40 px-1.5 py-0.5 text-[10px] text-amber-400">
                          possible duplicate
                        </span>
                      )}
                    </div>
                    {/* Match chips */}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {item.kind === "new_idea" && (
                        <span className="rounded-full border border-violet-500/40 px-1.5 py-0.5 text-[10px] text-violet-400">
                          new idea
                        </span>
                      )}
                      {(item.matchedSlots ?? []).map((m) => (
                        <span
                          key={m.platformPostId}
                          className={cn(
                            "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]",
                            scoreTint(m.score),
                          )}
                        >
                          <ChannelLogo platform={m.platform} className="size-3" />
                          → {m.slotDate.slice(5)}{" "}
                          {m.dayDelta === 0
                            ? ""
                            : `(${m.dayDelta > 0 ? "+" : ""}${m.dayDelta}d)`}
                        </span>
                      ))}
                      {(item.unmatchedPlatforms ?? []).map((p) => (
                        <span
                          key={p}
                          className="flex items-center gap-1 rounded-full border border-amber-500/40 px-1.5 py-0.5 text-[10px] text-amber-400"
                        >
                          <ChannelLogo platform={p} className="size-3" /> new spot
                        </span>
                      ))}
                      {item.applyError && (
                        <span className="rounded-full border border-rose-500/40 px-1.5 py-0.5 text-[10px] text-rose-400">
                          apply failed: {item.applyError.slice(0, 60)}
                        </span>
                      )}
                    </div>
                  </div>
                  {item.confidence != null && (
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] tabular-nums",
                        scoreTint(item.confidence),
                      )}
                    >
                      {Math.round(item.confidence * 100)}%
                    </span>
                  )}
                  {/* Decision buttons / applied link */}
                  <span
                    className="flex shrink-0 items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isApplied ? (
                      <Link
                        href={`/app/content/${item.appliedContentPostId}`}
                        className="text-emerald-400 hover:underline text-xs"
                      >
                        applied · open →
                      </Link>
                    ) : (
                      <>
                        <DecisionButton
                          active={st === "accepted"}
                          activeCls="border-emerald-500/60 bg-emerald-500/15 text-emerald-400"
                          title="Accept — apply as approved"
                          onClick={() => decide(item, "accepted")}
                        >
                          <Check className="size-3.5" />
                        </DecisionButton>
                        <DecisionButton
                          active={st === "accepted_refine"}
                          activeCls="border-sky-500/60 bg-sky-500/15 text-sky-400"
                          title="Accept, but mark for refinement — applies as draft"
                          onClick={() => decide(item, "accepted_refine")}
                        >
                          <Pencil className="size-3.5" />
                        </DecisionButton>
                        <DecisionButton
                          active={st === "rejected"}
                          activeCls="border-rose-500/60 bg-rose-500/15 text-rose-400"
                          title="Reject — slot stays open"
                          onClick={() => decide(item, "rejected")}
                        >
                          <X className="size-3.5" />
                        </DecisionButton>
                      </>
                    )}
                  </span>
                </div>

                {isOpen && (
                  <div className="bg-muted/20 space-y-2 border-t px-4 py-3 text-sm">
                    {idea.hook && (
                      <p>
                        <span className="text-muted-foreground text-xs">Hook · </span>
                        {idea.hook}
                      </p>
                    )}
                    {idea.captionDirection && (
                      <p className="text-muted-foreground text-xs whitespace-pre-wrap">
                        {idea.captionDirection}
                      </p>
                    )}
                    {idea.spots.map((s) => (
                      <div key={s.platform} className="rounded-lg border p-2">
                        <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs">
                          <ChannelLogo platform={s.platform} className="size-3.5" />
                          {s.format}
                          {s.template ? ` · ${s.template}` : ""}
                          {s.date ? ` · ships ${s.date}` : ""}
                        </div>
                        {s.caption ? (
                          <p className="text-foreground/90 text-xs whitespace-pre-wrap">
                            {s.caption}
                          </p>
                        ) : (
                          <p className="text-muted-foreground/60 text-xs">No caption in the sheet</p>
                        )}
                      </div>
                    ))}
                    <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {idea.ctaKeyword && <span>Keyword: {idea.ctaKeyword}</span>}
                      {idea.kpi && <span>KPI: {idea.kpi}</span>}
                      {idea.ownerName && (
                        <span>
                          Owner: {idea.ownerName}
                          {!idea.ownerId && (
                            <span className="text-amber-400"> (no matching member)</span>
                          )}
                        </span>
                      )}
                      {idea.sheetStatus && <span>Sheet status: {idea.sheetStatus}</span>}
                      {idea.assetLinks.length > 0 && (
                        <span>
                          {idea.assetLinks.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-foreground mr-2 underline"
                            >
                              asset {i + 1} ↗
                            </a>
                          ))}
                        </span>
                      )}
                      <span>Sheet rows: {idea.sourceRowIndexes.join(", ")}</span>
                    </div>
                    {item.reasoning && (
                      <p className="text-muted-foreground/70 text-[11px]">
                        Matcher: {item.reasoning}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="text-muted-foreground px-4 py-10 text-center text-sm">
              No items parsed.
            </div>
          )}
        </div>

        {/* Gaps rail */}
        <aside className="w-60 shrink-0 rounded-xl border p-3">
          <h3 className="mb-1 text-sm font-semibold">Slot coverage</h3>
          <p className="text-muted-foreground mb-3 text-xs tabular-nums">
            {consumedCount} of {slots.length} open slots filled by this import
          </p>
          <div className="space-y-3">
            {slotsByPlatform.map(([platform, list]) => (
              <div key={platform}>
                <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                  <ChannelLogo platform={platform} className="size-3.5" />
                  {platform}
                  <span className="ml-auto tabular-nums">
                    {list.filter((s) => !isConsumed(s)).length} open
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {list.map((s) => (
                    <span
                      key={s.contentPostId}
                      title={`${s.date} · ${s.archetype ?? ""} · ${s.pillar ?? ""}`}
                      className={cn(
                        "rounded border px-1 py-0.5 text-[10px] tabular-nums",
                        isConsumed(s)
                          ? "border-emerald-500/30 text-emerald-500/60 line-through"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {s.date.slice(8)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function DecisionButton({
  active,
  activeCls,
  title,
  onClick,
  children,
}: {
  active: boolean;
  activeCls: string;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex size-7 items-center justify-center rounded-full border transition-colors",
        active
          ? activeCls
          : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
