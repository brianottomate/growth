"use client";

import { useState } from "react";
import { ArrowLeft, FlaskConical } from "lucide-react";

import { Button } from "@/components/ui/button";

import { ClientWorkspace } from "./ClientWorkspace";
import { PipelineBoard } from "./PipelineBoard";
import { CLIENTS } from "./data";

export function PerformancePrototype() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = CLIENTS.find((client) => client.id === selectedId);

  return (
    <main className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <div className="flex gap-3">
          <FlaskConical
            className="mt-0.5 size-4 shrink-0 text-amber-500"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold">
              Fictional performance workflow prototype
            </p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              Fictional clients, demo budgets, demo booking counts, demo
              statuses, and illustrative images, copy, and links. No customer
              data, provider connections, API calls, persistence, or spend.
            </p>
          </div>
        </div>
        <span className="rounded-full border bg-background px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase">
          Demo only
        </span>
      </div>

      {selected ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
            <ArrowLeft aria-hidden="true" /> All demo clients
          </Button>
          {selected.featured ? (
            <ClientWorkspace />
          ) : (
            <section className="rounded-2xl border bg-card p-6 sm:p-8">
              <span className="text-xs font-semibold text-muted-foreground">
                {selected.stage} · Fictional client
              </span>
              <h2 className="mt-2 text-2xl font-semibold">{selected.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {selected.market} · {selected.meta}
              </p>
              <div className="mt-6 rounded-xl border bg-muted/30 p-5">
                <p className="font-medium">{selected.detail}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  This client is included to demonstrate pipeline selection.
                  Open featured ready client Desert House Co. for the complete
                  launch build.
                </p>
              </div>
            </section>
          )}
        </>
      ) : (
        <PipelineBoard onSelect={setSelectedId} />
      )}
    </main>
  );
}
