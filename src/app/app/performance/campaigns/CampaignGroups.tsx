"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/components/ui/lib/utils";

export type CampaignGroup = {
  id: string;
  title: string;
  count: number;
  dot: string;
  node: ReactNode;
};

/** Chips pick a group or all of them; the groups are rendered on the server. */
export function CampaignGroups({ groups, summary }: { groups: CampaignGroup[]; summary: string }) {
  const [picked, setPicked] = useState<string>("all");
  const shown = picked === "all" ? groups : groups.filter((group) => group.id === picked);
  const chip = (id: string, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setPicked(id)}
      aria-pressed={picked === id}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
        picked === id
          ? "border-foreground bg-foreground text-background"
          : "border-border/80 text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {chip("all", "All")}
        {groups.map((group) => chip(group.id, `${group.title} ${group.count}`))}
        <span className="text-muted-foreground ml-auto text-[11.5px]">{summary}</span>
      </div>
      {shown.map((group) => (
        <section key={group.id} className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className={cn("size-[7px] rounded-full", group.dot)} />
            <span className="text-[12.5px] font-semibold">{group.title}</span>
            <span className="text-muted-foreground text-[11.5px]">{group.count}</span>
          </div>
          {group.node}
        </section>
      ))}
    </div>
  );
}
