"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { orpc } from "@/orpc/client";
import { SimpleDialog } from "@/components/ui/dialog";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { PILLAR_BY_SLUG } from "@/lib/pillars";
import type { RouterOutputs } from "@/orpc/client";

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
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [moveSel, setMoveSel] = useState<Set<number>>(new Set());
  const [slotSel, setSlotSel] = useState<Set<number>>(new Set());

  const generate = useMutation(
    orpc.reschedule.generate.mutationOptions({
      onSuccess: (data) => {
        setProposal(data);
        setMoveSel(new Set(data.moves.map((_, i) => i)));
        setSlotSel(new Set(data.slots.map((_, i) => i)));
      },
    }),
  );
  const apply = useMutation(
    orpc.reschedule.applyPlan.mutationOptions({
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
    // oxlint-disable-next-line react/exhaustive-deps
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
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Looking at spacing, key
          dates, and gaps…
        </div>
      )}
      {generate.isError && (
        <p className="py-6 text-sm text-destructive">
          Couldn&apos;t generate suggestions. {generate.error.message}
        </p>
      )}

      {proposal && !generate.isPending && (
        <div className="flex flex-col gap-5">
          {nothing && (
            <p className="py-6 text-sm text-muted-foreground">
              Your calendar already looks well-spaced — no changes suggested.
            </p>
          )}

          {proposal.moves.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Moves · {proposal.moves.length}
              </h3>
              <div className="flex flex-col gap-1.5">
                {proposal.moves.map((m, i) => (
                  <label
                    key={i}
                    className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 hover:bg-accent/40"
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
                      <div className="text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          {fmtDate(m.fromDate)}
                        </span>
                        {" → "}
                        <span className="font-medium text-foreground tabular-nums">
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
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                New slots · {proposal.slots.length}
              </h3>
              <div className="flex flex-col gap-1.5">
                {proposal.slots.map((s, i) => {
                  const pillar = PILLAR_BY_SLUG[s.pillar];
                  return (
                    <label
                      key={i}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-dashed p-2.5 hover:bg-accent/40"
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
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              · {pillar.name}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
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
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
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
                className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
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
