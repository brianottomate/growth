"use client";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export type WorkLane =
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "live"
  | "other";
export function workLane(status: string): WorkLane {
  if (["published", "live", "active"].includes(status.toLowerCase()))
    return "live";
  if (status === "scheduled") return "scheduled";
  if (status === "approved") return "approved";
  if (["pending_review", "kept"].includes(status)) return "review";
  if (["draft", "drawn", "slot", "discovered"].includes(status)) return "draft";
  return "other";
}
export function StatusBoard({
  items,
  paid = false,
}: {
  items: { id: string; lane: WorkLane; card: ReactNode }[];
  paid?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const previewCount = paid ? 4 : 3;
  const lanes: { id: WorkLane; name: string }[] = [
    { id: "draft", name: "Draft" },
    { id: "review", name: paid ? "Shortlisted" : "Review" },
    { id: "approved", name: "Approved" },
    { id: "scheduled", name: "Scheduled" },
    { id: "live", name: "Live" },
    ...(items.some((item) => item.lane === "other")
      ? [{ id: "other" as const, name: "Other" }]
      : []),
  ];
  // The stage counts up top and the badge on each card say where work
  // stands; a lane board said the same thing twice.
  return (
    <div className="@container space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {lanes.map((lane) => {
          const count = items.filter((item) => item.lane === lane.id).length;
          return count ? (
            <span key={lane.id}>
              {count} {lane.name.toLowerCase()} {paid ? "ads" : "posts"}
            </span>
          ) : null;
        })}
      </div>
      <div className="space-y-3">
        <div
          className={
            paid
              ? "grid grid-cols-1 gap-3 @3xl:grid-cols-2"
              : "grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3"
          }
        >
          {(showAll ? items : items.slice(0, previewCount)).map((item) => (
            <div key={item.id}>{item.card}</div>
          ))}
        </div>
        {items.length > previewCount && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll ? "Show fewer" : `Show all ${items.length}`}
          </Button>
        )}
      </div>
    </div>
  );
}
