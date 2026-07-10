import { cn } from "@/lib/utils";

/**
 * Shared KPI stat card — promoted from the inline StatCard on /app (home).
 * `tone` tints the value for at-a-glance target status (e.g. DCPB vs $500).
 */
export function StatCard({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn" | "bad";
  className?: string;
}) {
  return (
    <div className={cn("bg-card rounded-xl border p-4", className)}>
      <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
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
