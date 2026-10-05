import type { CSSProperties } from "react";

import { cn } from "@/components/ui/lib/utils";
import {
  BUSINESS_LABEL,
  DELIVERY_LABEL,
  isClosedStage,
  type BusinessStage,
  type DeliveryStage,
} from "@/lib/performance-stage";
import {
  PIPELINE_COLUMNS,
  type PipelineStage,
} from "@/lib/performance-pipeline";

const chip =
  "inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-2 text-[10.5px] font-medium whitespace-nowrap";

type Tone = "success" | "warning" | "info" | "muted" | "neutral";

/** Design-system semantic colour, tinted behind the text; neutral for the quiet states. */
function toneStyle(tone: Tone): CSSProperties | undefined {
  if (tone === "neutral" || tone === "muted") return undefined;
  return {
    color: `var(--color-${tone})`,
    backgroundColor: `color-mix(in oklch, var(--color-${tone}) 8%, transparent)`,
    borderColor: `color-mix(in oklch, var(--color-${tone}) 25%, transparent)`,
  };
}

function Chip({
  tone,
  title,
  dot = false,
  className,
  children,
}: {
  tone: Tone;
  title: string;
  dot?: boolean;
  className?: string;
  children: string;
}) {
  return (
    <span
      className={cn(
        chip,
        tone === "muted" && "text-muted-foreground/70",
        tone === "neutral" && "text-muted-foreground",
        className,
      )}
      style={toneStyle(tone)}
      title={title}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/** Where the account sits on the Dashboard, the stage a person set. */
export function PipelineStageChip({
  stage,
  className,
}: {
  stage: PipelineStage;
  className?: string;
}) {
  const column = PIPELINE_COLUMNS.find((row) => row.id === stage);
  return (
    <span
      className={cn(chip, "bg-muted text-foreground", className)}
      title="Stage"
    >
      {column?.name ?? stage}
    </span>
  );
}

/** The money chip: paid is green, signed-but-unpaid is the one to look at. */
export function BusinessChip({
  stage,
  className,
}: {
  stage: BusinessStage;
  className?: string;
}) {
  const tone: Tone =
    stage === "paid"
      ? "success"
      : stage === "signed" || stage === "paused"
        ? "warning"
        : isClosedStage(stage)
          ? "muted"
          : "neutral";
  return (
    <Chip
      tone={tone}
      title="Business"
      dot={stage === "paid"}
      className={className}
    >
      {BUSINESS_LABEL[stage]}
    </Chip>
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
  const tone: Tone =
    stage === "live"
      ? "success"
      : stage === "paused" || stage === "ads_review"
        ? "warning"
        : stage === "not_started"
          ? "muted"
          : "info";
  return (
    <Chip
      tone={tone}
      title="Delivery"
      dot={stage === "live"}
      className={className}
    >
      {DELIVERY_LABEL[stage]}
    </Chip>
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
