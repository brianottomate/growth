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
  const [view, setView] = useState<"board" | "grid">("grid");
  const [expanded, setExpanded] = useState<WorkLane[]>([]);
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
  return (
    <div className="@container space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        <div
          className="flex gap-1 rounded-full border p-1"
          aria-label="Work view"
        >
          <Button
            size="sm"
            variant={view === "grid" ? "secondary" : "ghost"}
            onClick={() => setView("grid")}
            aria-pressed={view === "grid"}
          >
            Content
          </Button>
          <Button
            size="sm"
            variant={view === "board" ? "secondary" : "ghost"}
            onClick={() => setView("board")}
            aria-pressed={view === "board"}
          >
            Kanban
          </Button>
        </div>
      </div>
      {view === "grid" ? (
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
              variant="outline"
              size="sm"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll
                ? `Show first ${previewCount}`
                : `Load all ${items.length} ${paid ? "ads" : "posts"}`}
            </Button>
          )}
        </div>
      ) : (
        <div
          className="overflow-x-auto pb-2"
          role="region"
          aria-label={paid ? "Ad status board" : "Social post status board"}
          tabIndex={0}
        >
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${lanes.length}, minmax(160px, 1fr))`,
            }}
          >
            {lanes.map((lane) => {
              const entries = items.filter((item) => item.lane === lane.id);
              return (
                <section
                  key={lane.id}
                  className="min-w-0 rounded-xl bg-muted/30 p-2"
                >
                  <h4 className="mb-3 flex items-center justify-between px-1 text-xs font-medium">
                    {lane.name}
                    <span className="text-muted-foreground">
                      {entries.length}
                    </span>
                  </h4>
                  <div className="space-y-2">
                    {(expanded.includes(lane.id)
                      ? entries
                      : entries.slice(0, 2)
                    ).map((item) => (
                      <div key={item.id}>{item.card}</div>
                    ))}
                    {entries.length > 2 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setExpanded((current) =>
                            current.includes(lane.id)
                              ? current.filter((id) => id !== lane.id)
                              : [...current, lane.id],
                          )
                        }
                      >
                        {expanded.includes(lane.id)
                          ? "Show less"
                          : `Show ${entries.length - 2} more`}
                      </Button>
                    )}
                    {entries.length === 0 && (
                      <p className="px-1 py-5 text-xs text-muted-foreground">
                        No items
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
