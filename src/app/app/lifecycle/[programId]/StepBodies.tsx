"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export type BodyStep = {
  id: string;
  name: string;
  subject: string | null;
  body: string | null;
  delayMinutes: number | null;
  delayLabel: string | null;
};

function fmtDelay(min: number | null, label: string | null): string | null {
  if (label) return label;
  if (min == null) return null;
  if (min === 0) return "Day 0";
  if (min % 1440 === 0) return `Day ${min / 1440}`;
  if (min % 60 === 0) return `${min / 60}h`;
  return `${min}m`;
}

/**
 * Read-the-bodies accordion for a program's steps — so you can scan the actual
 * copy (subject + body) without opening each step's edit dialog. "Open all"
 * expands everything at once.
 */
export function StepBodies({ steps }: { steps: BodyStep[] }) {
  const withContent = steps.filter((s) => s.subject || s.body);
  const [open, setOpen] = useState<Set<string>>(new Set());

  if (withContent.length === 0) return null;

  const allOpen = withContent.every((s) => open.has(s.id));
  const toggleAll = () =>
    setOpen(allOpen ? new Set() : new Set(withContent.map((s) => s.id)));
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="bg-card mt-4 rounded-xl border">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">Step bodies</h2>
        <button
          type="button"
          onClick={toggleAll}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          {allOpen ? "Collapse all" : "Open all"}
        </button>
      </div>
      <ul className="divide-y">
        {steps.map((s, i) => {
          const has = Boolean(s.subject || s.body);
          const isOpen = open.has(s.id);
          const delay = fmtDelay(s.delayMinutes, s.delayLabel);
          return (
            <li key={s.id} className="px-4 py-2.5">
              <button
                type="button"
                disabled={!has}
                onClick={() => toggle(s.id)}
                className="flex w-full items-center gap-2 text-left disabled:cursor-default"
              >
                <span className="text-muted-foreground w-3.5 shrink-0">
                  {has ? (
                    isOpen ? (
                      <ChevronDown className="size-3.5" />
                    ) : (
                      <ChevronRight className="size-3.5" />
                    )
                  ) : null}
                </span>
                <span className="text-muted-foreground w-4 text-[11px] tabular-nums">
                  {i + 1}
                </span>
                <span className="text-sm font-medium">{s.name}</span>
                {delay && (
                  <span className="text-muted-foreground ml-auto text-[11px]">
                    {delay}
                  </span>
                )}
              </button>
              {isOpen && has && (
                <div className="mt-2 ml-10 text-xs">
                  {s.subject && (
                    <div className="text-foreground/90 font-medium">
                      Subject: {s.subject}
                    </div>
                  )}
                  {s.body && (
                    <pre className="text-muted-foreground mt-1 font-sans whitespace-pre-wrap">
                      {s.body}
                    </pre>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
