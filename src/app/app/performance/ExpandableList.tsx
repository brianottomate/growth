"use client";

import { Children, useState, type ReactNode } from "react";

/** Shows the first few rows; the rest sit behind one toggle. */
export function ExpandableList({
  limit,
  noun,
  children,
}: {
  limit: number;
  noun: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rows = Children.toArray(children);
  const hidden = rows.length - limit;
  return (
    <>
      <ul className="divide-y rounded-xl border">
        {open ? rows : rows.slice(0, limit)}
      </ul>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-[11.5px] hover:underline"
          style={{ color: "var(--color-link)" }}
        >
          {open ? "Show fewer" : `Show all ${rows.length} ${noun}`}
        </button>
      ) : null}
    </>
  );
}
