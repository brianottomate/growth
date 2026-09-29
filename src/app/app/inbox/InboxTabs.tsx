"use client";

import type { ReactNode } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";

export type InboxTabId = "all" | "dms" | "comments" | "ads";

const TABS: { id: InboxTabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "dms", label: "DMs" },
  { id: "comments", label: "Comments" },
  { id: "ads", label: "Ad comments" },
];

export function InboxTabs({
  defaultTab,
  sections,
}: {
  defaultTab: InboxTabId;
  // Each section is rendered once; shown when its tab is active (or on "All").
  // We toggle visibility (not mount) so triage results / expanded threads
  // survive tab switches.
  sections: {
    tab: Exclude<InboxTabId, "all">;
    node: ReactNode;
  }[];
}) {
  const [active, setActive] = useQueryState(
    "tab",
    parseAsStringLiteral(TABS.map((t) => t.id)).withDefault(defaultTab),
  );

  return (
    <div>
      <div className="mb-8 flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => void setActive(t.id)}
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
        {sections.map((s, i) => (
          <div key={i} hidden={active !== "all" && active !== s.tab}>
            {s.node}
          </div>
        ))}
      </div>
    </div>
  );
}
