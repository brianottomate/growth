import Link from "next/link";
import {
  performanceConnectionLines,
  type PerformanceConnectionSummary,
} from "@/lib/performance-connections";

export function CardConnections({
  connections,
  href,
}: {
  connections?: PerformanceConnectionSummary;
  href: string;
}) {
  if (!connections) return null;
  return (
    <Link
      href={`${href}/settings`}
      className="mt-3 block space-y-1 border-t pt-2 text-xs"
      title="Review account connections and tracking"
    >
      {performanceConnectionLines(connections).map((line) => (
        <div key={line.label} className="flex gap-2" title={line.value}>
          <span
            className={`mt-1 size-1.5 shrink-0 rounded-full ${line.ready ? "bg-emerald-500" : "bg-amber-500"}`}
          />
          <span className="shrink-0 font-medium">{line.label}</span>
          <span className="min-w-0 text-muted-foreground">{line.value}</span>
        </div>
      ))}
      <p className="pl-3.5 text-muted-foreground">
        {connections.clientSetupComplete
          ? "Client-owned setup complete"
          : "Client-owned setup incomplete"}
      </p>
    </Link>
  );
}

/**
 * The same four connections as one row of dots: green ready, amber not,
 * each labelled, the detail on hover. For the list rows, where the card's
 * four lines would not fit.
 */
export function ConnectionDots({
  connections,
  href,
}: {
  connections?: PerformanceConnectionSummary;
  href: string;
}) {
  if (!connections) return null;
  return (
    <Link
      href={`${href}/settings`}
      className="relative z-10 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
      title="Review account connections and tracking"
    >
      {performanceConnectionLines(connections).map((line) => (
        <span
          key={line.label}
          className="flex items-center gap-1.5"
          title={`${line.label}: ${line.value}`}
        >
          <span
            aria-hidden="true"
            className={`size-1.5 shrink-0 rounded-full ${line.ready ? "bg-emerald-500" : "bg-amber-500"}`}
          />
          <span className="sr-only">
            {line.ready ? "Ready" : "Needs attention"}:
          </span>
          {line.label}
        </span>
      ))}
    </Link>
  );
}
