"use client";

import { useState, type ReactNode } from "react";

export type SignalTabId = "all" | "dms" | "comments" | "mentions" | "x" | "llm";

const TABS: { id: SignalTabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "dms", label: "DMs" },
  { id: "comments", label: "Comments" },
  { id: "mentions", label: "Mentions" },
  { id: "x", label: "X" },
  { id: "llm", label: "LLM" },
];

export function SignalTabs({
  defaultTab,
  sections,
  overview,
}: {
  defaultTab: SignalTabId;
  // Each section is rendered once; shown when its tab is active (or on "All").
  // We toggle visibility (not mount) so triage results / expanded threads
  // survive tab switches. `exclusive` sections are full rooms of their own and
  // stay out of the "All" overview.
  sections: {
    tab: Exclude<SignalTabId, "all">;
    node: ReactNode;
    exclusive?: boolean;
  }[];
  // Cross-channel overview shown only on the "All" tab, above the sections.
  overview?: ReactNode;
}) {
  const [active, setActive] = useState<SignalTabId>(defaultTab);

  return (
    <div>
      <div className="mb-8 flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-10">
        {overview ? <div hidden={active !== "all"}>{overview}</div> : null}
        {sections.map((s, i) => (
          <div
            key={i}
            hidden={
              s.exclusive
                ? active !== s.tab
                : active !== "all" && active !== s.tab
            }
          >
            {s.node}
          </div>
        ))}
      </div>
    </div>
  );
}
