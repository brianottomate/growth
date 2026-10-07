import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";

/** Review state, separate from campaign assignment and platform delivery. */
export function ReviewStatusBadge({
  status,
  ...props
}: ComponentProps<typeof Badge> & { status: "draft" | "ready" | "approved" }) {
  const color =
    status === "approved" ? "var(--color-success)" : "var(--color-info)";
  return (
    <Badge
      variant="secondary"
      {...props}
      style={
        status === "draft"
          ? props.style
          : {
              color,
              backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`,
              borderColor: `color-mix(in oklab, ${color} 25%, transparent)`,
              ...props.style,
            }
      }
    >
      {status === "approved"
        ? "Approved"
        : status === "ready"
          ? "Ready"
          : "Draft"}
    </Badge>
  );
}
