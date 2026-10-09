import type { CSSProperties } from "react";

import {
  recordedPlatforms,
  type PerformanceCardState,
} from "@/lib/performance-card-state";
import { cn } from "@/components/ui/lib/utils";
import type { CardView } from "./PerformanceClientCard";

export type StatusChip = {
  label: string;
  value: string;
  lens: Exclude<CardView, "All">;
};

/** The recorded statuses a card carries, in the order the lenses read them. */
export function statusChips(state: PerformanceCardState): StatusChip[] {
  const chips: (Omit<StatusChip, "value"> & {
    value: string | null | undefined;
  })[] = [
    { label: "Catalog", value: state.catalog, lens: "Creative" },
    { label: "Ads", value: state.ads, lens: "Creative" },
    { label: "Email", value: state.newsletter, lens: "Creative" },
    ...recordedPlatforms(state).map((platform) => ({
      label: platform.label,
      value: platform.status,
      lens: "Delivery" as const,
    })),
    { label: "Zernio access", value: state.zernioAccess, lens: "Delivery" },
  ];
  return chips.map((chip) => ({
    ...chip,
    value: chip.value === "In production" ? "Creating" : (chip.value ?? ""),
  }));
}

/** Design-system semantic colour for a recorded status; none for the neutral ones. */
export function statusTone(value: string): CSSProperties | undefined {
  const token = [
    "Live",
    "Approved",
    "Export ready",
    "Verified",
    "Paid",
    "Submitted",
    "Connected",
    "Sending",
  ].includes(value)
    ? "--color-success"
    : ["In review", "DNS pending", "Paused", "Open"].includes(value)
      ? "--color-warning"
      : ["Creating", "Drafting", "Building", "Draft"].includes(value)
        ? "--color-info"
        : null;
  if (!token) return undefined;
  return {
    color: `var(${token})`,
    backgroundColor: `color-mix(in oklch, var(${token}) 8%, transparent)`,
  };
}

/**
 * Status chips for one account under one lens. Chips with nothing recorded
 * collapse into a count so the recorded ones stand out.
 */
export function StatusChips({
  state,
  view = "All",
  size = "sm",
  className,
}: {
  state: PerformanceCardState;
  view?: CardView;
  size?: "sm" | "md";
  className?: string;
}) {
  const chips = statusChips(state).filter(
    (chip) => view === "All" || chip.lens === view,
  );
  // Payments on the "All" lens are the money line's job; keep the chips to delivery state.
  const inLens =
    view === "All" ? chips.filter((chip) => chip.lens !== "Commercial") : chips;
  const recorded = inLens.filter((chip) => chip.value);
  const hidden = inLens.length - recorded.length;
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {recorded.map((chip) => (
        <span
          key={chip.label}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-border/70 whitespace-nowrap",
            size === "sm" ? "h-[22px] px-2 text-[11px]" : "h-6 px-2.5 text-xs",
          )}
          style={statusTone(chip.value)}
        >
          <span className="text-muted-foreground">{chip.label}</span>
          <span className="font-semibold">{chip.value}</span>
        </span>
      ))}
      {hidden > 0 ? (
        <span
          className={cn(
            "inline-flex items-center whitespace-nowrap text-muted-foreground/80",
            size === "sm" ? "h-[22px] px-1 text-[11px]" : "h-6 px-1 text-xs",
          )}
        >
          {hidden} not recorded
        </span>
      ) : null}
    </div>
  );
}
