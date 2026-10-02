import { cn } from "@/components/ui/lib/utils";
import {
  BUSINESS_LABEL,
  DELIVERY_LABEL,
  isClosedStage,
  type BusinessStage,
  type DeliveryStage,
} from "@/lib/performance-stage";

const chip =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium whitespace-nowrap";

/** The money chip: paid is green, signed-but-unpaid is the one to look at. */
export function BusinessChip({
  stage,
  className,
}: {
  stage: BusinessStage;
  className?: string;
}) {
  const tone =
    stage === "paid"
      ? "border-emerald-500/40 text-foreground"
      : stage === "signed"
        ? "border-amber-500/40 text-foreground"
        : stage === "paused"
          ? "border-amber-500/40 text-foreground"
          : isClosedStage(stage)
            ? "border-border/60 text-muted-foreground/70"
            : "border-border/80 text-muted-foreground";
  return (
    <span className={cn(chip, tone, className)} title="Business">
      {stage === "paid" ? (
        <span className="size-1.5 rounded-full bg-emerald-400" />
      ) : null}
      {BUSINESS_LABEL[stage]}
    </span>
  );
}

/** The production chip: live is green, review and paused are amber. */
export function DeliveryChip({
  stage,
  className,
}: {
  stage: DeliveryStage;
  className?: string;
}) {
  const tone =
    stage === "live"
      ? "border-emerald-500/40 text-foreground"
      : stage === "paused" || stage === "ads_review"
        ? "border-amber-500/40 text-foreground"
        : stage === "not_started"
          ? "border-border/60 text-muted-foreground/70"
          : "border-sky-500/40 text-foreground";
  return (
    <span className={cn(chip, tone, className)} title="Delivery">
      {stage === "live" ? (
        <span className="size-1.5 rounded-full bg-emerald-400" />
      ) : null}
      {DELIVERY_LABEL[stage]}
    </span>
  );
}

/** Both chips on a brand row, business first. */
export function StageChips({
  business,
  delivery,
  className,
}: {
  business: BusinessStage;
  delivery: DeliveryStage;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-1.5", className)}
    >
      <BusinessChip stage={business} />
      <DeliveryChip stage={delivery} />
    </span>
  );
}
