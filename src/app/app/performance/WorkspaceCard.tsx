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
    <div className="grid grid-cols-1 items-start gap-3 @xl:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <h2 className="flex max-w-full min-w-0 items-center gap-2 text-base font-semibold">
          <Icon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 break-words">{title}</span>
          {count !== undefined && (
            <span className="shrink-0 font-normal text-muted-foreground tabular-nums">
              {count}
            </span>
          )}
        </h2>
        {titleAccessory}
      </div>
      {actions && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 @xl:max-w-[60cqw] @xl:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}
