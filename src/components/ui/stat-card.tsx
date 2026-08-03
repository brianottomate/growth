"use client";

import { Info } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * ⓘ explainer — a Radix Popover styled as a tooltip, click/tap to open.
 * Popover (not Tooltip) because Radix tooltips never open on touch; and
 * deliberately NO hover-open — mixing controlled hover with Radix's
 * activation/dismiss ordering makes real pointer clicks race (hover opens,
 * pointerdown dismisses, click re-toggles). Plain trigger = same behavior on
 * desktop and phone: click opens, click again / outside / Esc closes.
 */
function ExplainerTip({
  label,
  explainer,
}: {
  label: string;
  explainer: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`About ${label}`}
        className="focus-visible:ring-ring cursor-help rounded-full opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:outline-none"
      >
        <Info className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-auto max-w-72 px-3 py-2 text-left text-xs leading-relaxed font-normal tracking-normal normal-case"
      >
        {explainer}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Shared KPI stat card — promoted from the inline StatCard on /app (home).
 * `tone` tints the value for at-a-glance target status (e.g. DCPB vs $500).
 * `explainer` renders a small ⓘ with a Radix tooltip (hover, keyboard focus,
 * and tap — the trigger is a real button) so viewers understand what they're
 * looking at without leaving the page.
 */
export function StatCard({
  label,
  value,
  hint,
  tone,
  explainer,
  className,
  valueClassName,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn" | "bad";
  explainer?: string;
  className?: string;
  /** Extra classes on the value line (e.g. a larger mono figure on /app/spend). */
  valueClassName?: string;
}) {
  return (
    <div className={cn("bg-card rounded-xl border p-4", className)}>
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
        <span>{label}</span>
        {explainer && <ExplainerTip label={label} explainer={explainer} />}
      </div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold",
          tone === "good" && "text-emerald-400",
          tone === "warn" && "text-amber-400",
          tone === "bad" && "text-red-400",
          valueClassName,
        )}
      >
        {value}
      </div>
      {hint && <div className="text-muted-foreground mt-1 text-xs">{hint}</div>}
    </div>
  );
}
