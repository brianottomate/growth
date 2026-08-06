"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { useTRPC } from "@/trpc/react";
import { SimpleDialog } from "@/components/ui/dialog";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { PILLAR_BY_SLUG } from "@/lib/pillars";
import type { RouterOutputs } from "@/trpc/react";

type Proposal = RouterOutputs["reschedule"]["generate"];

const fmtDate = (ymd: string) =>
  new Date(`${ymd}T12:00:00`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

/** AI reshuffle: propose moves + slot fills, review with checkboxes, apply. */
export function ReshuffleDialog({
  brandId,
  year,
  open,
  onClose,
  onApplied,
}: {
  brandId: string;
  year: number;
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const trpc = useTRPC();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [moveSel, setMoveSel] = useState<Set<number>>(new Set());
  const [slotSel, setSlotSel] = useState<Set<number>>(new Set());

  const generate = useMutation(
    trpc.reschedule.generate.mutationOptions({
      onSuccess: (data) => {
        setProposal(data);
        setMoveSel(new Set(data.moves.map((_, i) => i)));
        setSlotSel(new Set(data.slots.map((_, i) => i)));
      },
    }),
  );
  const apply = useMutation(
    trpc.reschedule.applyPlan.mutationOptions({
      onSuccess: () => {
        onApplied();
        onClose();
      },
    }),
  );

  useEffect(() => {
    if (open) {
      setProposal(null);
      generate.mutate({ brandId, year });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (
    sel: Set<number>,
    set: (s: Set<number>) => void,
    i: number,
  ) => {
    const n = new Set(sel);
    if (n.has(i)) n.delete(i);
    else n.add(i);
    set(n);
  };

  const nothing = proposal?.moves.length === 0 && proposal?.slots.length === 0;
  const selectedCount = moveSel.size + slotSel.size;

  return (
    <SimpleDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="✨ Reshuffle the calendar"
      size="lg"
      scrollable
    >
      {generate.isPending && (
        <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
          <Loader2 className="size-4 animate-spin" /> Looking at spacing, key
          dates, and gaps…
        </div>
      )}
      {generate.isError && (
        <p className="text-destructive py-6 text-sm">
          Couldn&apos;t generate suggestions. {generate.error.message}
        </p>
      )}

      {proposal && !generate.isPending && (
        <div className="flex flex-col gap-5">
          {nothing && (
            <p className="text-muted-foreground py-6 text-sm">
              Your calendar already looks well-spaced — no changes suggested.
            </p>
          )}

          {proposal.moves.length > 0 && (
            <div>
              <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                Moves · {proposal.moves.length}
              </h3>
              <div className="flex flex-col gap-1.5">
                {proposal.moves.map((m, i) => (
                  <label
                    key={i}
                    className="hover:bg-accent/40 flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={moveSel.has(i)}
                      onChange={() => toggle(moveSel, setMoveSel, i)}
                      className="mt-0.5"
                    />
                    <ChannelLogo
                      platform={m.platform}
                      className="mt-0.5 size-4 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {m.title ?? "Untitled"}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        <span className="tabular-nums">
                          {fmtDate(m.fromDate)}
                        </span>
                        {" → "}
                        <span className="text-foreground font-medium tabular-nums">
                          {fmtDate(m.toDate)}
                        </span>
                        {" · "}
                        {m.reason}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {proposal.slots.length > 0 && (
            <div>
              <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                New slots · {proposal.slots.length}
              </h3>
              <div className="flex flex-col gap-1.5">
                {proposal.slots.map((s, i) => {
                  const pillar = PILLAR_BY_SLUG[s.pillar];
                  return (
                    <label
                      key={i}
                      className="hover:bg-accent/40 flex cursor-pointer items-start gap-2.5 rounded-lg border border-dashed p-2.5"
                    >
                      <input
                        type="checkbox"
                        checked={slotSel.has(i)}
                        onChange={() => toggle(slotSel, setSlotSel, i)}
                        className="mt-0.5"
                      />
                      <ChannelLogo
                        platform={s.platform}
                        className="mt-0.5 size-4 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">
                          {fmtDate(s.date)} · {platformLabel(s.platform)}
                          {pillar && (
                            <span className="text-muted-foreground font-normal">
                              {" "}
                              · {pillar.name}
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {s.rationale}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {!nothing && (
            <div className="flex items-center justify-end gap-2 border-t pt-3">
              <button
                onClick={onClose}
                className="border-border hover:bg-accent rounded-md border px-3 py-1.5 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  apply.mutate({
                    brandId,
                    moves: proposal.moves
                      .filter((_, i) => moveSel.has(i))
                      .map((m) => ({ spotId: m.spotId, toDate: m.toDate })),
                    slots: proposal.slots
                      .filter((_, i) => slotSel.has(i))
                      .map((s) => ({
                        date: s.date,
                        platform: s.platform,
                        pillar: s.pillar,
                      })),
                  })
                }
                disabled={selectedCount === 0 || apply.isPending}
                className="bg-foreground text-background rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                {apply.isPending
                  ? "Applying…"
                  : `Apply ${selectedCount} change${selectedCount === 1 ? "" : "s"}`}
              </button>
            </div>
          )}
        </div>
      )}
    </SimpleDialog>
  );
}
