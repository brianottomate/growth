import { cn } from "@/components/ui/lib/utils";
import {
  isClientStage,
  isClosedStage,
  STAGE_LABEL,
  type PerformanceStage,
} from "@/lib/performance-stage";

/** The one chip on a brand row: where it is on the way to live. */
export function StageChip({ stage, className }: { stage: PerformanceStage; className?: string }) {
  const tone =
    stage === "live"
      ? "border-emerald-500/40 text-emerald-300"
      : stage === "paused" || stage === "ads_review"
        ? "border-amber-500/40 text-amber-300"
        : isClosedStage(stage)
          ? "border-border/60 text-muted-foreground/70"
          : isClientStage(stage)
            ? "border-sky-500/40 text-sky-300"
            : "border-border/80 text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium whitespace-nowrap",
        tone,
        className,
      )}
    >
      {stage === "live" ? <span className="size-1.5 rounded-full bg-emerald-400" /> : null}
      {STAGE_LABEL[stage]}
    </span>
  );
}
