"use client";

import { useEffect, useRef, useState } from "react";
import { Pin, Plus, RotateCw, Undo2, X } from "lucide-react";

import { ChannelLogo } from "@/components/channel-logos";
import { type RouterOutputs } from "@/trpc/react";

export type Blueprint = RouterOutputs["moment"]["generate"];
export type Slot = Blueprint["slots"][number];
type AmplifierAsk = Blueprint["amplifierAsks"][number];

/** What a regenerate sends back up: pinned beats kept verbatim + blanks + steer. */
export type RefinePayload = {
  keepSlots: Slot[];
  blanks?: number;
  drop?: string[];
  steer?: string;
};

const KIND_CLS: Record<string, string> = {
  anchored: "bg-sky-500/15 text-sky-300",
  freeflow: "bg-violet-500/15 text-violet-300",
  cadence: "bg-emerald-500/15 text-emerald-300",
};

const rel = (d: number) => (d === 0 ? "launch" : d > 0 ? `+${d}d` : `${d}d`);

type WorkingSlot =
  | { id: number; kind: "real"; slot: Slot; pinned: boolean; removed: boolean }
  | { id: number; kind: "blank" };

/**
 * Remix slot-builder — the shared review surface for /launch and the media
 * launch drawer. Pin the beats you're sure of, blank the ones you want
 * re-proposed, drop a steer, then regenerate (only the open beats change).
 * Edits are reported up via onEdited for commit; regenerate goes up via
 * onRegenerate as a refine payload. Prior art: boe-ventures/chronicler remix.
 */
export function BlueprintReview({
  blueprint,
  onEdited,
  onRegenerate,
  regenerating,
}: {
  blueprint: Blueprint;
  onEdited: (edited: { slots: Slot[]; amplifierAsks: AmplifierAsk[] }) => void;
  onRegenerate: (payload: RefinePayload) => void;
  regenerating: boolean;
}) {
  const idRef = useRef(0);
  const nextId = () => (idRef.current += 1);

  const [slots, setSlots] = useState<WorkingSlot[]>([]);
  const [amps, setAmps] = useState<{ ask: AmplifierAsk; removed: boolean }[]>([]);
  const [steer, setSteer] = useState("");

  // A fresh proposal resets the working state. Anchored beats start pinned —
  // they're the committed skeleton; freeflow starts open for re-proposal.
  useEffect(() => {
    setSlots(
      blueprint.slots.map((slot) => ({
        id: nextId(),
        kind: "real" as const,
        slot,
        pinned: slot.slotKind === "anchored",
        removed: false,
      })),
    );
    setAmps(blueprint.amplifierAsks.map((ask) => ({ ask, removed: false })));
    setSteer("");
  }, [blueprint]);

  const realSlots = slots.filter(
    (s): s is Extract<WorkingSlot, { kind: "real" }> => s.kind === "real",
  );
  const effectiveSlots = realSlots.filter((s) => !s.removed).map((s) => s.slot);
  const effectiveAmps = amps.filter((a) => !a.removed).map((a) => a.ask);
  const blankCount = slots.filter((s) => s.kind === "blank").length;
  const pinnedCount = realSlots.filter((s) => s.pinned && !s.removed).length;

  // Report committable edits upward whenever they change.
  useEffect(() => {
    onEdited({ slots: effectiveSlots, amplifierAsks: effectiveAmps });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, amps]);

  const togglePin = (id: number) =>
    setSlots((prev) =>
      prev.map((s) =>
        s.kind === "real" && s.id === id ? { ...s, pinned: !s.pinned } : s,
      ),
    );
  const toggleRemove = (id: number) =>
    setSlots((prev) =>
      prev.map((s) =>
        s.kind === "real" && s.id === id ? { ...s, removed: !s.removed } : s,
      ),
    );
  const addBlank = () =>
    setSlots((prev) => [...prev, { id: nextId(), kind: "blank" }]);
  const dropBlank = (id: number) =>
    setSlots((prev) => prev.filter((s) => s.id !== id));
  const toggleAmp = (i: number) =>
    setAmps((prev) =>
      prev.map((a, j) => (j === i ? { ...a, removed: !a.removed } : a)),
    );

  const regenerate = () =>
    onRegenerate({
      keepSlots: realSlots.filter((s) => s.pinned && !s.removed).map((s) => s.slot),
      blanks: blankCount || undefined,
      drop: realSlots.filter((s) => s.removed).map((s) => s.slot.title),
      steer: steer.trim() || undefined,
    });

  return (
    <div>
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Proposed shape</h2>
        <span className="text-muted-foreground text-xs">
          {blueprint.scale} · {effectiveSlots.length} slots · {effectiveAmps.length}{" "}
          amplifiers · not saved yet
        </span>
      </div>
      {blueprint.verdictReason && (
        <p className="text-muted-foreground mt-0.5 text-xs">{blueprint.verdictReason}</p>
      )}

      {blueprint.missing && (
        <p className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-xs text-amber-200/90">
          <span className="font-medium">Not covered: </span>
          {blueprint.missing}
        </p>
      )}

      <p className="text-muted-foreground mt-3 text-[11px]">
        📌 Pin the beats you&apos;re sure of, add blanks for new beats, then
        regenerate — pinned beats stay put, the rest gets re-proposed.
      </p>

      <div className="mt-2">
        {slots.map((s) =>
          s.kind === "blank" ? (
            <div
              key={s.id}
              className="border-accent/40 flex items-center gap-3 border-l-2 border-dashed py-2 pl-3"
            >
              <div className="text-muted-foreground w-12 shrink-0 text-[11px]">?</div>
              <span className="text-muted-foreground flex-1 text-sm italic">
                Blank beat — AI fills this on regenerate
              </span>
              <button
                onClick={() => dropBlank(s.id)}
                className="text-muted-foreground hover:text-foreground shrink-0"
                title="Remove blank"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <SlotRow
              key={s.id}
              slot={s.slot}
              pinned={s.pinned}
              removed={s.removed}
              onTogglePin={() => togglePin(s.id)}
              onToggleRemove={() => toggleRemove(s.id)}
            />
          ),
        )}
      </div>

      {/* Remix controls */}
      <div className="mt-3 space-y-2">
        <button
          onClick={addBlank}
          className="border-border text-muted-foreground hover:text-foreground hover:border-accent/50 flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1 text-xs transition-colors"
        >
          <Plus className="size-3.5" /> Add blank beat
        </button>
        <div className="flex items-center gap-2">
          <input
            value={steer}
            onChange={(e) => setSteer(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !regenerating && regenerate()}
            placeholder="Steer the regenerate — e.g. “more reels, end on a recap, less paid”"
            className="border-border bg-background flex-1 rounded-md border px-2 py-1.5 text-sm"
          />
          <button
            onClick={regenerate}
            disabled={regenerating}
            className="border-border hover:border-accent/50 flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            title={
              pinnedCount
                ? `Keep ${pinnedCount} pinned, re-propose the rest`
                : "Re-propose the whole shape"
            }
          >
            <RotateCw className={`size-3.5 ${regenerating ? "animate-spin" : ""}`} />
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      </div>

      {amps.length > 0 && (
        <div className="mt-5">
          <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Amplifiers to recruit
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {amps.map((a, i) => (
              <button
                key={i}
                onClick={() => toggleAmp(i)}
                title={a.ask.why ?? undefined}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  a.removed
                    ? "bg-muted/30 text-muted-foreground line-through"
                    : "bg-muted/50"
                }`}
              >
                {a.ask.name}
                <span className="text-muted-foreground"> · {a.ask.type}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SlotRow({
  slot,
  pinned,
  removed,
  onTogglePin,
  onToggleRemove,
}: {
  slot: Slot;
  pinned: boolean;
  removed: boolean;
  onTogglePin: () => void;
  onToggleRemove: () => void;
}) {
  const spots = slot.spots ?? [];
  return (
    <div
      className={`flex gap-3 border-l-2 py-2 pl-3 ${
        removed ? "border-border/60 opacity-40" : pinned ? "border-emerald-500/50" : "border-border/60"
      }`}
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
      <div className="flex shrink-0 items-start gap-2">
        <button
          onClick={onTogglePin}
          className={`transition-colors ${
            pinned
              ? "text-emerald-400"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title={pinned ? "Pinned — kept on regenerate" : "Pin this beat"}
        >
          <Pin className={`size-3.5 ${pinned ? "fill-emerald-400/30" : ""}`} />
        </button>
        <button
          onClick={onToggleRemove}
          className="text-muted-foreground hover:text-foreground"
          title={removed ? "Restore" : "Remove from plan"}
        >
          {removed ? <Undo2 className="size-3.5" /> : <X className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}
