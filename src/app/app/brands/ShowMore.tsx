"use client";

import { type ReactNode, useState } from "react";

/** The first `limit` items, with a toggle that reveals the rest in place. */
export function ShowMore({
  items,
  limit = 5,
  className,
}: {
  items: ReactNode[];
  limit?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const hidden = items.length - limit;
  return (
    <div className={className}>
      {open || hidden <= 0 ? items : items.slice(0, limit)}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="self-center justify-self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {open ? "Show less" : `Show ${hidden} more`}
        </button>
      )}
    </div>
  );
}
