"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";

import { useTRPC } from "@/trpc/react";
import { SimpleSelect } from "@/components/ui/select";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { cn } from "@/components/ui/lib/utils";

// The team-facing pipeline (a deliberate subset of the 9-value enum).
export const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

// Channels the team actually plans into (the add-a-cross-post menu).
const PLATFORM_OPTIONS = [
  "instagram",
  "tiktok",
  "pinterest",
  "youtube",
  "facebook",
  "x",
  "linkedin",
  "threads",
] as const;

type Brief = {
  hook: string | null;
  captionDirection: string | null;
  visualDirection: string | null;
  ctaText: string | null;
  ctaKeyword: string | null;
  kpi: string | null;
};

/** The editable editorial brief — the sheet's hook/caption/CTA/KPI columns,
 *  written once at the idea level + status + plan date. Saves on blur. */
export function BriefEditor({
  contentPostId,
  initial,
  status,
  plannedAtISO,
}: {
  contentPostId: string;
  initial: Brief;
  status: string;
  plannedAtISO: string | null;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const update = useMutation(
    trpc.content.updateBrief.mutationOptions({ onSettled: () => router.refresh() }),
  );
  const setStatus = useMutation(
    trpc.content.setStatus.mutationOptions({ onSettled: () => router.refresh() }),
  );

  const save = (patch: Partial<Brief> & { plannedAt?: string | null }) =>
    update.mutate({ id: contentPostId, ...patch });

  return (
    <div className="bg-card mt-5 rounded-xl border p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
          Brief
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <SimpleSelect
            value={STATUS_OPTIONS.some((s) => s.value === status) ? status : "draft"}
            onValueChange={(v) => setStatus.mutate({ id: contentPostId, status: v as never })}
            options={STATUS_OPTIONS}
            size="sm"
            aria-label="Status"
          />
          <input
            type="date"
            value={plannedAtISO ? plannedAtISO.slice(0, 10) : ""}
            onChange={(e) =>
              save({ plannedAt: e.target.value ? new Date(e.target.value).toISOString() : null })
            }
            className="bg-background rounded-md border px-2 py-1 text-xs"
            aria-label="Plan date"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Hook" value={initial.hook} onSave={(v) => save({ hook: v })} />
        <Field label="CTA" value={initial.ctaText} onSave={(v) => save({ ctaText: v })} />
        <Field
          label="Caption direction"
          value={initial.captionDirection}
          multiline
          onSave={(v) => save({ captionDirection: v })}
        />
        <Field
          label="Visual direction"
          value={initial.visualDirection}
          multiline
          onSave={(v) => save({ visualDirection: v })}
        />
        <Field
          label="Trigger keyword"
          value={initial.ctaKeyword}
          placeholder="e.g. ESCAPE"
          onSave={(v) => save({ ctaKeyword: v })}
        />
        <Field label="Primary KPI" value={initial.kpi} onSave={(v) => save({ kpi: v })} />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onSave,
  multiline,
  placeholder,
}: {
  label: string;
  value: string | null;
  onSave: (v: string | null) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const [v, setV] = useState(value ?? "");
  const commit = () => {
    const next = v.trim() ? v.trim() : null;
    if (next !== (value ?? null)) onSave(next);
  };
  const cls =
    "bg-background focus:ring-ring/40 w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-2";
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
        {label}
      </span>
      {multiline ? (
        <textarea
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          placeholder={placeholder}
          rows={3}
          className={cn(cls, "resize-y")}
        />
      ) : (
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          placeholder={placeholder}
          className={cls}
        />
      )}
    </label>
  );
}

/** Change one spot's status independently of the idea (channels ship on
 *  different days). Owned spots only — wired in for source === "owned". */
export function SpotStatusControl({
  platformPostId,
  status,
}: {
  platformPostId: string;
  status: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const setSpotStatus = useMutation(
    trpc.content.setSpotStatus.mutationOptions({ onSettled: () => router.refresh() }),
  );
  return (
    <SimpleSelect
      value={STATUS_OPTIONS.some((s) => s.value === status) ? status : "draft"}
      onValueChange={(v) => setSpotStatus.mutate({ platformPostId, status: v as never })}
      options={STATUS_OPTIONS}
      size="sm"
      aria-label="Spot status"
    />
  );
}

/** Fan the idea out to another channel (the "break into cross-posts" action). */
export function AddSpotControl({
  contentPostId,
  existingPlatforms,
}: {
  contentPostId: string;
  existingPlatforms: string[];
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const add = useMutation(
    trpc.content.addSpot.mutationOptions({ onSettled: () => router.refresh() }),
  );
  const available = PLATFORM_OPTIONS.filter((p) => !existingPlatforms.includes(p));
  if (available.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground flex items-center gap-1 text-xs">
        <Plus className="size-3.5" /> Cross-post to
      </span>
      {available.map((p) => (
        <button
          key={p}
          disabled={add.isPending}
          onClick={() => add.mutate({ contentPostId, platform: p })}
          className="border-border hover:bg-accent flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50"
        >
          <ChannelLogo platform={p} className="size-3.5" />
          {platformLabel(p)}
        </button>
      ))}
    </div>
  );
}

/** Remove an owned spot (cross-post undo). Only shown on owned, not scraped. */
export function RemoveSpotButton({ platformPostId }: { platformPostId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const remove = useMutation(
    trpc.content.removeSpot.mutationOptions({ onSettled: () => router.refresh() }),
  );
  return (
    <button
      onClick={() => remove.mutate({ platformPostId })}
      disabled={remove.isPending}
      aria-label="Remove channel"
      className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md p-1 transition-colors disabled:opacity-50"
    >
      <X className="size-3.5" />
    </button>
  );
}
