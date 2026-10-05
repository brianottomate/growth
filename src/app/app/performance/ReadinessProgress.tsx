import type {
  ReadinessChecklist,
  ReadinessFix,
} from "@/lib/performance-readiness";
import { cn } from "@/components/ui/lib/utils";

export type ReadinessLinks = Record<ReadinessFix, string | null>;

export function readinessGroupLabel(_id: string, label: string) {
  return label;
}

export function ReadinessProgress({
  checklist,
  compact = false,
}: {
  checklist: ReadinessChecklist;
  compact?: boolean;
}) {
  return (
    <div
      className={cn("grid", compact ? "gap-2" : "gap-4")}
      style={{
        gridTemplateColumns: `repeat(${checklist.groups.length}, minmax(0, 1fr))`,
      }}
    >
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
