import { cn } from "@/components/ui/lib/utils";
import { ReviewStatusBadge } from "@/components/review/ReviewStatusBadge";

/** Compatibility wrapper for existing approval indicators. Dates remain in the tooltip. */
export function ApprovedStamp({
  at,
  fresh = false,
  size: _size = "sm",
  className,
}: {
  at?: string | Date | null;
  fresh?: boolean;
  size?: "sm" | "lg";
  className?: string;
}) {
  const date = at ? new Date(at) : null;
  return (
    <span
      className={cn(
        "inline-flex",
        fresh && "animate-in duration-200 fade-in",
        className,
      )}
    >
      <ReviewStatusBadge
        status="approved"
        title={
          date && !Number.isNaN(date.getTime())
            ? `Approved ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            : "Approved"
        }
      />
    </span>
  );
}
