"use client";
import { useState } from "react";
import {
  Check,
  ChevronDown,
  Clock3,
  Loader2,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkflowStatus } from "@/lib/workflow-run";
type Status = WorkflowStatus;
export type RunActivityItem = {
  id: string;
  title: string;
  destination: string;
  status: Status;
  message: string;
  count?: { completed: number; total: number; unit: string };
  steps?: { title: string; status: Status }[];
  issue?: string;
  retry?: string;
};
type Run = RunActivityItem;
export function StatusIcon({ status }: { status: Status }) {
  const Icon =
    status === "running"
      ? Loader2
      : status === "queued"
        ? Clock3
        : status === "succeeded"
          ? Check
          : TriangleAlert;
  return (
    <Icon
      aria-hidden="true"
      className={`size-4 shrink-0 ${status === "running" ? "animate-spin" : ""}`}
    />
  );
}

/** Pure presentation; a production adapter supplies authorized, normalized runs. */
function RunRow({
  run,
  onOpen,
  onContinue,
  onDismiss,
}: {
  run: Run;
  onOpen: () => void;
  onContinue: () => void;
  onDismiss?: () => void;
}) {
  const needsAttention = run.status === "failed";
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <StatusIcon status={run.status} />
          <span className="text-sm font-medium">{run.title}</span>
        </div>
        {run.count && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {run.count.completed}/{run.count.total} {run.count.unit}
          </span>
        )}
        {run.retry && (
          <Button size="sm" variant="outline" onClick={onContinue}>
            <RotateCcw className="size-3.5" />
            {run.retry}
          </Button>
        )}
        {needsAttention && onDismiss && (
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onOpen}>
          Open {run.destination}
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground" role="status">
        {run.message}
      </p>
      {(run.steps || needsAttention) && (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="w-fit cursor-pointer">
            {needsAttention ? "Details" : "Steps"}
          </summary>
          {run.issue && <p className="mt-2">{run.issue}</p>}
          {run.steps && (
            <ul className="mt-3 grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-4">
              {run.steps.map((step) => (
                <li key={step.title} className="flex items-center gap-2">
                  <StatusIcon status={step.status} />
                  {step.title}
                  <span className="sr-only">{step.status}</span>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
    </div>
  );
}

export function RunActivity({
  runs,
  onOpen,
  onContinue,
  onDismiss,
}: {
  runs: Run[];
  onOpen: (tab: string, id: string) => void;
  onContinue: (id: string) => void;
  onDismiss?: (id: string) => void;
}) {
  const active = runs.filter(
    (run) => run.status !== "succeeded" && run.status !== "cancelled",
  );
  const [expanded, setExpanded] = useState(false);
  if (!active.length) return null;
  const shown = expanded ? active : active.slice(0, 2);
  return (
    <section
      aria-label="Background work"
      className="overflow-hidden rounded-xl border bg-card"
    >
      <div className="divide-y">
        {shown.map((run) => (
          <RunRow
            key={run.id}
            run={run}
            onOpen={() => onOpen(run.destination, run.id)}
            onContinue={() => onContinue(run.id)}
            onDismiss={onDismiss ? () => onDismiss(run.id) : undefined}
          />
        ))}
      </div>
      {active.length > 2 && (
        <div className="border-t px-4 py-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronDown
              aria-hidden="true"
              className={`size-3.5 ${expanded ? "rotate-180" : ""}`}
            />
            {expanded ? "Show less" : `${active.length - 2} more job`}
          </Button>
        </div>
      )}
    </section>
  );
}
