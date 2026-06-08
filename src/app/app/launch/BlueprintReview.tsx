"use client";

import { ChannelLogo } from "@/components/channel-logos";
import { type RouterOutputs } from "@/trpc/react";

export type Blueprint = RouterOutputs["moment"]["generate"];
export type Slot = Blueprint["slots"][number];

const KIND_CLS: Record<string, string> = {
  anchored: "bg-sky-500/15 text-sky-300",
  freeflow: "bg-violet-500/15 text-violet-300",
  cadence: "bg-emerald-500/15 text-emerald-300",
};

const rel = (d: number) => (d === 0 ? "launch" : d > 0 ? `+${d}d` : `${d}d`);

export function SlotRow({
  slot,
  removed,
  onToggle,
}: {
  slot: Slot;
  removed: boolean;
  onToggle: () => void;
}) {
  const spots = slot.spots ?? [];
  return (
    <div
      className={`border-border/60 flex gap-3 border-l-2 py-2 pl-3 ${removed ? "opacity-40" : ""}`}
    >
      <div className="text-muted-foreground w-12 shrink-0 text-[11px] tabular-nums">
        {rel(slot.dayOffset)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${removed ? "line-through" : ""}`}>
            {slot.title}
          </span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${KIND_CLS[slot.slotKind] ?? "bg-muted text-muted-foreground"}`}
          >
            {slot.slotKind}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {spots.map((sp, i) => (
            <span
              key={i}
              className="bg-muted/50 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
            >
              <ChannelLogo platform={sp.platform} className="size-3" />
              {sp.archetype}
              {sp.template ? ` · ${sp.template}` : ""}
            </span>
          ))}
        </div>
      </div>
      <button
        onClick={onToggle}
        className="text-muted-foreground hover:text-foreground shrink-0 text-xs"
        title={removed ? "Restore" : "Remove from plan"}
      >
        {removed ? "↩" : "✕"}
      </button>
    </div>
  );
}

/**
 * The "proposed shape" review block: slots + amplifier asks with per-row
 * remove/restore toggles. Shared by the /launch page and the media launch
 * drawer so both edit the blueprint identically before committing.
 */
export function BlueprintReview({
  blueprint,
  removedSlots,
  removedAmps,
  onToggleSlot,
  onToggleAmp,
}: {
  blueprint: Blueprint;
  removedSlots: Set<number>;
  removedAmps: Set<number>;
  onToggleSlot: (i: number) => void;
  onToggleAmp: (i: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Proposed shape</h2>
        <span className="text-muted-foreground text-xs">
          {blueprint.scale} · {blueprint.slots.length - removedSlots.size} slots ·{" "}
          {blueprint.amplifierAsks.length - removedAmps.size} amplifiers · not saved
          yet
        </span>
      </div>
      {blueprint.verdictReason && (
        <p className="text-muted-foreground mt-0.5 text-xs">{blueprint.verdictReason}</p>
      )}

      <div className="mt-3">
        {blueprint.slots.map((s, i) => (
          <SlotRow
            key={i}
            slot={s}
            removed={removedSlots.has(i)}
            onToggle={() => onToggleSlot(i)}
          />
        ))}
      </div>

      {blueprint.amplifierAsks.length > 0 && (
        <div className="mt-5">
          <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Amplifiers to recruit
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {blueprint.amplifierAsks.map((a, i) => (
              <button
                key={i}
                onClick={() => onToggleAmp(i)}
                title={a.why ?? undefined}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  removedAmps.has(i)
                    ? "bg-muted/30 text-muted-foreground line-through"
                    : "bg-muted/50"
                }`}
              >
                {a.name}
                <span className="text-muted-foreground"> · {a.type}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
