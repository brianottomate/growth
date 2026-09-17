"use client";

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/lib/utils";

import { CLIENTS, STAGES, type Stage } from "./data";

const TONES: Record<Stage, string> = {
  Lead: "border-t-zinc-500 bg-zinc-500/[0.03]",
  Onboarding: "border-t-sky-500 bg-sky-500/[0.04]",
  "Ready to launch": "border-t-amber-500 bg-amber-500/[0.04]",
  Live: "border-t-emerald-500 bg-emerald-500/[0.04]",
};
const DOTS: Record<Stage, string> = {
  Lead: "bg-zinc-500",
  Onboarding: "bg-sky-500",
  "Ready to launch": "bg-amber-500",
  Live: "bg-emerald-500",
};
const SUBTITLE: Record<Stage, string> = {
  Lead: "Start the conversation",
  Onboarding: "Collect, connect, prepare",
  "Ready to launch": "Entire local build complete",
  Live: "Enabled in Meta after Brooke's QA",
};

export function PipelineBoard({
  onSelect,
}: {
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<Stage | "All">("All");
  const visible = useMemo(
    () =>
      CLIENTS.filter(
        (client) =>
          (stage === "All" || client.stage === stage) &&
          `${client.name} ${client.market}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [query, stage],
  );

  return (
    <section
      aria-label="Demo client pipeline board"
      className="min-w-0 space-y-5"
    >
      <header>
        <p className="text-xs font-semibold text-muted-foreground">
          Client journey · Interactive demo
        </p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight">Clients</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Lead → Onboarding → Ready to launch → Live
        </p>
      </header>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search demo clients</span>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search clients or markets"
          />
        </label>
        <label>
          <span className="sr-only">Filter by journey stage</span>
          <select
            value={stage}
            onChange={(event) => setStage(event.target.value as Stage | "All")}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm sm:w-48"
          >
            <option value="All">All active stages</option>
            {STAGES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STAGES.map((column) => {
          const clients = visible.filter((client) => client.stage === column);
          const stageId = `stage-${column.toLowerCase().replaceAll(" ", "-")}`;
          return (
            <section
              key={column}
              className={cn(
                "min-w-0 rounded-xl border border-t-[3px] p-3",
                TONES[column],
              )}
              aria-labelledby={stageId}
            >
              <div className="mb-3 flex items-start justify-between gap-2 px-1">
                <div>
                  <h3
                    id={stageId}
                    className="flex items-center gap-2 text-sm font-semibold"
                  >
                    <span className={cn("size-2 rounded-full", DOTS[column])} />
                    {column}
                  </h3>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {SUBTITLE[column]}
                  </p>
                </div>
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs">
                  {clients.length}
                </span>
              </div>
              <div className="space-y-3">
                {clients.map((client) => (
                  <article
                    key={client.id}
                    className={cn(
                      "rounded-xl border bg-card p-4 shadow-xs",
                      client.featured &&
                        "border-amber-500/40 ring-1 ring-amber-500/10",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold">
                        {client.initials}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-semibold">
                          {client.name}
                        </h4>
                        <p className="truncate text-xs text-muted-foreground">
                          {client.market}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>{client.meta}</span>
                      <span className="text-right">{client.budget}</span>
                    </div>
                    <p className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-xs font-medium">
                      {client.detail}
                    </p>
                    <Button
                      onClick={() => onSelect(client.id)}
                      aria-label={`${
                        client.featured
                          ? "Review demo launch brief"
                          : "View demo client"
                      } for ${client.name}, ${client.stage} stage: ${client.detail}`}
                      variant={client.featured ? "default" : "outline"}
                      size="sm"
                      shape="round"
                      className="mt-3 w-full"
                    >
                      {client.featured
                        ? "Review demo launch brief"
                        : "View demo client"}
                      <ArrowRight aria-hidden="true" />
                    </Button>
                  </article>
                ))}
                {clients.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    No matching clients
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      <footer className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>Stage changes never start ad spend.</span>
        <span>
          Paused, lost, and churned would live in separate filters (no demo
          records).
        </span>
      </footer>
    </section>
  );
}
