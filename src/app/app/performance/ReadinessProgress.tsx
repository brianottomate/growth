import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import type {
  ReadinessChecklist,
  ReadinessFix,
} from "@/lib/performance-readiness";
import { cn } from "@/components/ui/lib/utils";

export type ReadinessLinks = Record<ReadinessFix, string | null>;

const NEXT_STEP_LABELS: Record<string, string> = {
  intake: "Collect intake",
  budget: "Set media budget",
  access: "Verify ad account access",
  homes: "Add homes to the account",
  contacts: "Add report and invoice contacts",
  mark: "Add brand mark",
  folder: "Collect creative assets",
  previews: "Save creative previews",
  ads: "Draft ads",
  campaign: "Draft a campaign",
  audience: "Check ad account audiences",
  pushed: "Prepare campaign on Meta",
};

export function readinessGroupLabel(id: string, label: string) {
  return id === "onboarded" ? "Onboarding" : label;
}

/** The first unfinished item with a destination, not an inferred blocker. */
export function suggestedReadinessAction(
  checklist: ReadinessChecklist,
  links: ReadinessLinks,
) {
  for (const group of checklist.groups) {
    for (const item of group.items) {
      const href = item.action ? links[item.action.to] : null;
      if (!item.done && item.action && href) return { item, group, href };
    }
  }
  return null;
}

export function ReadinessProgress({
  checklist,
  compact = false,
}: {
  checklist: ReadinessChecklist;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid grid-cols-3", compact ? "gap-2" : "gap-4")}>
      {checklist.groups.map((group) => (
        <div key={group.id} className="min-w-0 space-y-2">
          <div
            className={cn(
              "flex justify-between gap-x-1 gap-y-0.5 text-xs",
              compact
                ? "flex-wrap items-baseline"
                : "flex-col items-start @lg:flex-row @lg:items-baseline",
            )}
          >
            <span className="text-muted-foreground">
              {readinessGroupLabel(group.id, group.label)}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {group.done}/{group.total}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`${readinessGroupLabel(group.id, group.label)} checklist`}
            aria-valuemin={0}
            aria-valuemax={group.total}
            aria-valuenow={group.done}
            className="h-1 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-foreground transition-[width] motion-reduce:transition-none"
              style={{
                width: `${group.total ? (group.done / group.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReadinessNextStep({
  checklist,
  links,
  compact = false,
}: {
  checklist: ReadinessChecklist;
  links: ReadinessLinks;
  compact?: boolean;
}) {
  const next = suggestedReadinessAction(checklist, links);
  if (!next) return null;
  return (
    <Link
      href={next.href}
      className={cn(
        "group flex items-center justify-between gap-3 rounded-lg bg-muted/40 text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
        compact ? "px-3 py-2.5" : "px-4 py-3.5",
      )}
    >
      <span className="min-w-0">
        <span className="block text-[11px] text-muted-foreground">
          Suggested next step
          {!compact
            ? ` · ${readinessGroupLabel(next.group.id, next.group.label)}`
            : ""}
        </span>
        <span
          className={cn(
            "mt-0.5 block font-medium",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {NEXT_STEP_LABELS[next.item.id] ?? next.item.label}
        </span>
        {!compact && next.item.detail ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {next.item.detail}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {!compact ? (
          <span className="hidden text-xs @lg:inline">
            {next.item.action!.label}
          </span>
        ) : null}
        <ArrowUpRight aria-hidden="true" className="size-4" />
      </span>
    </Link>
  );
}
