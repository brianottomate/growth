import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/components/ui/lib/utils";

/**
 * What a section shows before it has anything: one line on what belongs
 * here, one on how it gets here, and the actions that put it here. Every
 * empty section in the app should look like this one, so a new client's page
 * reads as a path rather than a wall of blanks.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  compact = false,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Buttons or links, already styled; rendered in a row under the copy. */
  actions?: ReactNode;
  /** A tighter version for sections that sit inside a step. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border/70 bg-muted/20 flex flex-col items-center justify-center rounded-xl border border-dashed text-center",
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-10",
        className,
      )}
    >
      {Icon ? (
        <span className="bg-background text-muted-foreground flex size-9 items-center justify-center rounded-full border">
          <Icon className="size-4" />
        </span>
      ) : null}
      <div className="space-y-1">
        <p className={cn("font-medium", compact ? "text-sm" : "text-base")}>{title}</p>
        {description ? (
          <p className="text-muted-foreground mx-auto max-w-md text-xs leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
