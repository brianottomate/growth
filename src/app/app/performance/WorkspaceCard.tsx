import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/lib/utils";

/** Shared section chrome; records and mutations remain owned by the caller. */
export function WorkspaceCard({
  title,
  icon: Icon,
  count,
  actions,
  titleAccessory,
  children,
  className,
  id,
}: {
  title: string;
  icon: LucideIcon;
  count?: number | string;
  actions?: ReactNode;
  titleAccessory?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn("space-y-4 rounded-xl border bg-background p-4", className)}
    >
      <WorkspaceCardHeader
        title={title}
        icon={Icon}
        count={count}
        actions={actions}
        titleAccessory={titleAccessory}
      />
      {children}
    </section>
  );
}

export function WorkspaceCardHeader({
  title,
  icon: Icon,
  count,
  actions,
  titleAccessory,
}: {
  title: string;
  icon: LucideIcon;
  count?: number | string;
  actions?: ReactNode;
  titleAccessory?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
          <Icon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          {title}
          {count !== undefined && (
            <span className="font-normal text-muted-foreground tabular-nums">
              {count}
            </span>
          )}
        </h2>
        {titleAccessory}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
