import type { ReactNode } from "react";

import { cn } from "@/components/ui/lib/utils";

/**
 * The frame every Performance list page starts with: what the page is, one
 * line on what it holds, and the one action that adds to it. The toolbar
 * (filters left, search right) sits in `children` so the pages line up.
 */
export function PerformancePageHeader({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex shrink-0 flex-col gap-5", className)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-60 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {action ? (
          <div className="flex items-center gap-2">{action}</div>
        ) : null}
      </div>
      {children}
    </header>
  );
}

/** A filter pill: filled when it is the one picked, outlined otherwise. */
export function FilterPill({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number | string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold whitespace-nowrap transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border/80 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {count != null ? (
        <span className={cn("font-normal", active ? "opacity-70" : "")}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

/** Two or three ways to see the same rows, as one control. */
export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex rounded-full bg-muted p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "h-7 rounded-full px-3 text-xs font-semibold transition-colors",
            value === option.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
