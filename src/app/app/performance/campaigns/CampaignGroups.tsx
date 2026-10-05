"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/components/ui/lib/utils";
import { FilterPill } from "../PageHeader";

export type CampaignGroup = {
  id: string;
  title: string;
  count: number;
  dot: string;
  node: ReactNode;
};

/** Chips pick a group or all of them; the groups are rendered on the server. */
export function CampaignGroups({
  groups,
  summary,
}: {
  groups: CampaignGroup[];
  summary: string;
}) {
  const [picked, setPicked] = useState<string>("all");
  const shown =
    picked === "all" ? groups : groups.filter((group) => group.id === picked);
  const chip = (id: string, label: string, count?: number) => (
    <FilterPill
      key={id}
      active={picked === id}
      onClick={() => setPicked(id)}
      count={count}
    >
      {label}
    </FilterPill>
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {chip("all", "All")}
        {groups.map((group) => chip(group.id, group.title, group.count))}
        <span className="ml-auto text-[11.5px] text-muted-foreground">
          {summary}
        </span>
      </div>
      {shown.map((group) => (
        <section key={group.id} className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className={cn("size-[7px] rounded-full", group.dot)} />
            <span className="text-[12.5px] font-semibold">{group.title}</span>
            <span className="text-[11.5px] text-muted-foreground">
              {group.count}
            </span>
          </div>
          {group.node}
        </section>
      ))}
    </div>
  );
}
