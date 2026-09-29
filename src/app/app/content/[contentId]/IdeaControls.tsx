"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";

import { orpc } from "@/orpc/client";
import { SimpleSelect } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { ChannelLogo } from "@/components/channel-logos";
import { cn } from "@/components/ui/lib/utils";
import { sendAssistantIntent } from "@/lib/assistant-events";
import { toast } from "@/components/ui/toast";

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
  {
    platform: "instagram",
    format: "instagram.image",
    label: "Instagram feed",
  },
  { platform: "instagram", format: "instagram.reel", label: "Instagram Reel" },
  {
    platform: "instagram",
    format: "instagram.story",
    label: "Instagram Story",
  },
  { platform: "tiktok", format: "tiktok.video", label: "TikTok" },
  { platform: "facebook", format: "facebook.reel", label: "Facebook Reel" },
  { platform: "pinterest", format: "pinterest.pin", label: "Pinterest" },
  { platform: "youtube", format: "youtube.video", label: "YouTube" },
  { platform: "facebook", format: "facebook.post", label: "Facebook feed" },
  {
    platform: "facebook",
    format: "facebook.carousel",
    label: "Facebook carousel",
  },
  {
    platform: "facebook",
    format: "facebook.story",
    label: "Facebook Story",
  },
  { platform: "x", format: "x.tweet", label: "X" },
  { platform: "linkedin", format: "linkedin.post", label: "LinkedIn" },
  { platform: "threads", format: "threads.post", label: "Threads" },
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
  const router = useRouter();
  const update = useMutation(
    orpc.content.updateWorkItem.mutationOptions({
      onError: (error) => toast.error(error.message),
      onSettled: () => router.refresh(),
    }),
  );

  const save = (patch: Partial<Brief> & { plannedAt?: string | null }) =>
    update.mutate({ contentPostId, brief: patch });

  return (
    <div className="mt-5 rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Brief
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <SimpleSelect
            value={
              STATUS_OPTIONS.some((s) => s.value === status) ? status : "draft"
            }
            onValueChange={(v) =>
              update.mutate({ contentPostId, contentStatus: v as never })
            }
            options={STATUS_OPTIONS}
            size="sm"
            aria-label="Status"
          />
          <DatePicker
            value={plannedAtISO ? new Date(plannedAtISO) : undefined}
            onChange={(d) => save({ plannedAt: d ? d.toISOString() : null })}
            placeholder="Plan date"

            aria-label="Plan date"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
        <Field
          label="Hook"
          value={initial.hook}
          onSave={(v) => save({ hook: v })}
        />
        <Field
          label="CTA"
          value={initial.ctaText}
          onSave={(v) => save({ ctaText: v })}
        />
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
        <Field
          label="Primary KPI"
          value={initial.kpi}
          onSave={(v) => save({ kpi: v })}
        />
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
      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
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

/**
 * Fan the idea out to another channel (the "break into cross-posts" action).
 *
 * The chip asks the assistant for the cross-post; it does not write one. An
 * empty draft on a new channel is work, not progress, and creating it here
 * committed to a hardcoded format before anyone had looked at the brief, which
 * is how a video idea acquired an Instagram feed-image spot. The assistant sees
 * the root spot and the brief, picks the right product (Reel, not still), and
 * writes the adaptation in the same move.
 */
export function AddSpotControl({
  contentPostId,
  existingTargets,
  brandId,
  brandName,
  contentTitle,
  sourcePlatform,
}: {
  contentPostId: string;
  existingTargets: string[];
  brandId: string;
  brandName: string;
  contentTitle: string;
  /** The spot this cross-post should be adapted from, when there is one. */
  sourcePlatform?: string | null;
}) {
  const existing = new Set(existingTargets);
  const available = PLATFORM_OPTIONS.filter(
    (option) =>
      !existing.has(`${option.platform}|${option.format}`) &&
      !existing.has(`${option.platform}|`),
  );
  if (available.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Plus className="size-3.5" /> Cross-post to
      </span>
      {available.map((option) => (
        <button
          key={`${option.platform}|${option.format}`}
          onClick={() =>
            sendAssistantIntent({
              type: "work_content_post",
              brandId,
              brandName,
              contentPostId,
              contentTitle,
              platform: option.platform,
              visibleText: `Cross-post "${contentTitle}" to ${option.label}. Add the spot${
                sourcePlatform
                  ? `, adapted from the ${sourcePlatform} version`
                  : ""
              }, pick the format that fits the brief rather than defaulting, write channel-native copy, and tell me what you changed.`,
            })
          }
          className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
        >
          <ChannelLogo platform={option.platform} className="size-3.5" />
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Remove an owned spot (cross-post undo). Only shown on owned, not scraped. */
export function RemoveSpotButton({
  platformPostId,
}: {
  platformPostId: string;
}) {
  const router = useRouter();
  const remove = useMutation(
    orpc.content.removeSpot.mutationOptions({
      onSettled: () => router.refresh(),
    }),
  );
  return (
    <button
      onClick={() => remove.mutate({ platformPostId })}
      disabled={remove.isPending}
      aria-label="Remove channel"
      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
    >
      <X className="size-3.5" />
    </button>
  );
}
