import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Shared KPI stat card — promoted from the inline StatCard on /app (home).
 * `tone` tints the value for at-a-glance target status (e.g. DCPB vs $500).
 * `explainer` renders a small ⓘ with a plain-English hover explanation so
 * viewers understand what they're looking at without leaving the page.
 */
export function StatCard({
  label,
  value,
  hint,
  tone,
  explainer,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn" | "bad";
  explainer?: string;
  className?: string;
}) {
  return (
    <div className={cn("bg-card rounded-xl border p-4", className)}>
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide">
        <span>{label}</span>
        {explainer && (
          <span title={explainer} className="cursor-help" aria-label={explainer}>
            <Info className="size-3.5 opacity-60" aria-hidden />
          </span>
        )}
      </div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold",
          tone === "good" && "text-emerald-400",
          tone === "warn" && "text-amber-400",
          tone === "bad" && "text-red-400",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-muted-foreground mt-1 text-xs">{hint}</div>}
    </div>
  );
}
