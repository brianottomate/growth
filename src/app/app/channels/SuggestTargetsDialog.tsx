"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";

import { useTRPC } from "@/trpc/react";
import type { RouterOutputs } from "@/trpc/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChannelLogo } from "@/components/channel-logos";
import { toast } from "@/components/ui/toast";
import { cn } from "@/components/ui/lib/utils";
import { PILLAR_BY_SLUG } from "@/lib/pillars";

type SuggestResult = RouterOutputs["cadence"]["suggestTargets"];
type Suggestion = SuggestResult["suggestions"][number];

/** AI-proposed cadence/mix target updates, from own Zernio performance +
 *  peer cadences. Blueprint-style: nothing persists until a row's Apply
 *  writes through setCadenceTarget / setMixTarget. */
export function SuggestTargetsDialog({
  brandId,
  brandName,
  open,
  onOpenChange,
}: {
  brandId: string;
  brandName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [result, setResult] = useState<SuggestResult | null>(null);
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const appliedAny = useRef(false);

  const suggest = useMutation(
    trpc.cadence.suggestTargets.mutationOptions({
      onSuccess: setResult,
      onError: (e) => toast.error(e.message),
    }),
  );
  const applyCadence = useMutation(
    trpc.cadence.setCadenceTarget.mutationOptions({
      onError: (e) => toast.error(e.message),
    }),
  );
  const applyMix = useMutation(
    trpc.cadence.setMixTarget.mutationOptions({
      onError: (e) => toast.error(e.message),
    }),
  );

  // Fresh run per open (the evidence moves).
  useEffect(() => {
    if (open) {
      setResult(null);
      setApplied(new Set());
      appliedAny.current = false;
      suggest.mutate({ brandId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, brandId]);

  const apply = async (s: Suggestion, idx: number) => {
    if (s.kind === "cadence") {
      await applyCadence.mutateAsync({
        brandId,
        channelId: s.channelId!,
        archetype: s.archetype!,
        count: s.proposed,
        period: (s.period ?? "week") as "day" | "week" | "month",
      });
    } else {
      // Seeded mix rows live on period "month" — target the same key.
      await applyMix.mutateAsync({
        brandId,
        pillar: s.pillar!,
        targetPct: s.proposed,
        period: "month",
      });
    }
    appliedAny.current = true;
    setApplied((prev) => new Set(prev).add(idx));
  };

  const close = (o: boolean) => {
    if (!o && appliedAny.current) router.refresh();
    onOpenChange(o);
  };

  const ev = result?.evidence;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Suggested target updates · {brandName}</DialogTitle>
        </DialogHeader>

        {suggest.isPending && (
          <p className="text-muted-foreground text-sm">
            Reading your performance data and peer cadences…
          </p>
        )}

        {ev && (
          <p className="text-muted-foreground -mt-2 text-xs">
            Evidence: {ev.ownPosts} own posts · {ev.peerPosts} peer posts across{" "}
            {ev.peerBrands} tracked brands · last {ev.windowDays} days.
            {ev.peerDataAgeDays != null && ev.peerDataAgeDays > 14 && (
              <span className="text-amber-400">
                {" "}
                Peer data is ~{ev.peerDataAgeDays}d stale — re-scrape the peer
                cards for a stronger benchmark.
              </span>
            )}
          </p>
        )}

        {result?.suggestions.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No changes proposed — the evidence supports the current targets.
          </p>
        )}

        {result && result.suggestions.length > 0 && (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {result.suggestions.map((s, idx) => {
              const isApplied = applied.has(idx);
              const label =
                s.kind === "cadence" ? (
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <ChannelLogo platform={s.platform!} className="size-3.5" />
                    {s.archetype}
                    <span className="text-muted-foreground text-xs">/{s.period}</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <span
                      className="size-2 rounded-full"
                      style={{
                        background:
                          PILLAR_BY_SLUG[s.pillar!]?.color ??
                          "var(--color-muted-foreground)",
                      }}
                    />
                    {PILLAR_BY_SLUG[s.pillar!]?.name ?? s.pillar}
                    <span className="text-muted-foreground text-xs">mix %</span>
                  </span>
                );
              return (
                <div key={idx} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {label}
                    <span className="flex items-center gap-1.5 text-sm tabular-nums">
                      <span className="text-muted-foreground">
                        {s.current ?? "—"}
                      </span>
                      <ArrowRight className="text-muted-foreground size-3.5" />
                      <span className="font-semibold text-emerald-400">
                        {s.proposed}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-1.5 py-0.5 text-[10px] tabular-nums",
                        s.confidence >= 0.7
                          ? "border-emerald-500/40 text-emerald-400"
                          : "border-amber-500/40 text-amber-400",
                      )}
                    >
                      {Math.round(s.confidence * 100)}%
                    </span>
                    <span className="ml-auto">
                      {isApplied ? (
                        <span className="text-xs text-emerald-400">applied ✓</span>
                      ) : (
                        <button
                          onClick={() => void apply(s, idx)}
                          disabled={applyCadence.isPending || applyMix.isPending}
                          className="rounded-full border border-emerald-600/50 px-2.5 py-0.5 text-xs font-medium text-emerald-400 hover:bg-emerald-600/15 disabled:opacity-50"
                        >
                          Apply
                        </button>
                      )}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1.5 text-xs">
                    {s.rationale}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={() => close(false)}
            className="border-border hover:bg-accent rounded-full border px-4 py-1.5 text-sm"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
