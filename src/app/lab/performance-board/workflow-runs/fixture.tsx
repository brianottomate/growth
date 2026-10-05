"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock3,
  Images,
  Layers,
  Loader2,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspaceCard } from "@/app/app/performance/WorkspaceCard";

type Status = "queued" | "running" | "succeeded" | "failed";
type Tab = "WanderOS" | "Catalog" | "Ad studio" | "Campaigns";
type Run = {
  id: string;
  title: string;
  destination: Tab;
  status: Status;
  message: string;
  count?: { completed: number; total: number; unit: string };
  steps?: { title: string; status: Status }[];
  issue?: string;
  retry?: string;
};

const scenarios = {
  "One job": [
    {
      id: "ads",
      title: "Generating ads",
      destination: "Ad studio",
      status: "running",
      message: "Composing Garden Haven",
      count: { completed: 8, total: 11, unit: "ads" },
    },
  ],
  Import: [
    {
      id: "import",
      title: "Importing WanderOS",
      destination: "WanderOS",
      status: "running",
      message: "Preparing catalog cards",
      steps: [
        { title: "Import homes", status: "succeeded" },
        { title: "Select featured homes", status: "succeeded" },
        { title: "Create destinations", status: "succeeded" },
        { title: "Prepare catalog", status: "running" },
      ],
    },
  ],
  "Multiple jobs": [
    {
      id: "ads",
      title: "Generating ads",
      destination: "Ad studio",
      status: "running",
      message: "Composing Garden Haven",
      count: { completed: 8, total: 11, unit: "ads" },
    },
    {
      id: "export",
      title: "Exporting catalog",
      destination: "Catalog",
      status: "running",
      message: "Rendering Square images",
      count: { completed: 42, total: 164, unit: "images" },
    },
    {
      id: "prepare",
      title: "Preparing catalog",
      destination: "Catalog",
      status: "queued",
      message: "Waiting for the current catalog operation",
    },
  ],
  "Needs attention": [
    {
      id: "prepare",
      title: "Catalog preparation interrupted",
      destination: "Catalog",
      status: "failed",
      message: "142 cards prepared · 2 failed · 20 remaining",
      count: { completed: 142, total: 164, unit: "cards" },
      issue: "The run reached its time limit. Prepared cards are saved.",
      retry: "Continue remaining",
    },
    {
      id: "ads",
      title: "Ad generation interrupted",
      destination: "Ad studio",
      status: "failed",
      message: "8 of 11 drafts saved",
      issue:
        "The worker stopped responding. Inspect the saved drafts before starting another batch.",
    },
  ],
  Completed: [
    {
      id: "ads",
      title: "Ads generated",
      destination: "Ad studio",
      status: "succeeded",
      message: "11 drafts ready for review",
      count: { completed: 11, total: 11, unit: "ads" },
    },
  ],
} satisfies Record<string, Run[]>;
type Scenario = keyof typeof scenarios;

function StatusIcon({ status }: { status: Status }) {
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
}: {
  run: Run;
  onOpen: () => void;
  onContinue: () => void;
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

function RunActivity({
  runs,
  onOpen,
  onContinue,
}: {
  runs: Run[];
  onOpen: (tab: Tab) => void;
  onContinue: (id: string) => void;
}) {
  const active = runs.filter((run) => run.status !== "succeeded");
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
            onOpen={() => onOpen(run.destination)}
            onContinue={() => onContinue(run.id)}
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

const columns = [
  [
    "Identity & scope",
    "id · organization_id · brand_id",
    "Every run belongs to one workspace and brand. The service validates campaign, document and thread ownership before starting.",
  ],
  [
    "Workflow",
    "workflow_type · workflow_version",
    "Examples: wanderos.import, ads.generate, catalog.prepare, catalog.export, document.produce. These choose a registered handler and its input schema.",
  ],
  [
    "Optional relationships",
    "campaign_id · document_id · content_post_id · thread_id",
    "Campaign jobs can target a campaign; brand ads do not need one. document_id references the existing production_packet table.",
  ],
  [
    "Hierarchy & retries",
    "parent_run_id · retry_of_id",
    "Catalog preparation within an import is a child. A user retry creates a new run and keeps the previous outcome.",
  ],
  [
    "Lifecycle",
    "status · created_at · started_at · finished_at · updated_at",
    "queued → running → succeeded / failed / cancelled. Success does not approve creative or publish anything.",
  ],
  [
    "Progress",
    "message · progress (JSONB)",
    "Optional completed/total/unit, failed and remaining counts, and named steps. No invented percentages for work we cannot measure.",
  ],
  [
    "Execution",
    "input · checkpoint · result (JSONB)",
    "Immutable input snapshot; resumable work checkpoint; typed result references or pending provider candidates. Permanent outputs live in domain records.",
  ],
  [
    "Claims & duplicate prevention",
    "idempotency_key · lock_key · claim_token · lease_expires_at",
    "Idempotency identifies a request. A lock protects a mutable resource. Worker writes require the current claim token. A table alone is not a job runner.",
  ],
  [
    "Provider integration",
    "provider · provider_request_id · webhook_token_hash",
    "Nullable. Used for external async requests and authenticated callbacks. Model, prompt and provider options live in typed input.",
  ],
  [
    "Failures & attribution",
    "error · created_by",
    "Structured error plus the initiating teammate. Resume/retry/cancel actions are capabilities of the workflow handler.",
  ],
];

export function WorkflowRunsFixture() {
  const [scenario, setScenario] = useState<Scenario>("Multiple jobs");
  const [runs, setRuns] = useState<Run[]>(scenarios["Multiple jobs"]);
  const [tab, setTab] = useState<Tab>("Ad studio");
  const [view, setView] = useState<"Preview" | "Data model">("Preview");
  const [history, setHistory] = useState(false);
  const [retryHistory, setRetryHistory] = useState<Run[]>([]);
  const previousStatuses = useRef(
    new Map(runs.map((run) => [run.id, run.status])),
  );
  // Model a polling transition. Historical successful runs do not announce again.
  useEffect(() => {
    for (const run of runs) {
      const previous = previousStatuses.current.get(run.id);
      if (
        run.status === "succeeded" &&
        (previous === "running" || previous === "queued")
      ) {
        toast.success(run.message, {
          id: `workflow-fixture-${run.id}`,
          action:
            tab !== run.destination
              ? {
                  label: "View results",
                  onClick: () => setTab(run.destination),
                }
              : undefined,
        });
      }
    }
    previousStatuses.current = new Map(runs.map((run) => [run.id, run.status]));
  }, [runs, tab]);
  function completeAds() {
    setRuns((current) =>
      current.map((run) =>
        run.id === "ads" && run.status === "running"
          ? {
              ...run,
              status: "succeeded",
              title: "Ads generated",
              message: "11 draft ads ready for review",
              count: { completed: 11, total: 11, unit: "ads" },
            }
          : run,
      ),
    );
  }
  function choose(next: Scenario) {
    previousStatuses.current = new Map(
      scenarios[next].map((run) => [run.id, run.status]),
    );
    toast.dismiss("workflow-fixture-ads");
    setScenario(next);
    setRuns(scenarios[next]);
    setRetryHistory([]);
    setHistory(false);
  }
  function continueRun(id: string) {
    const original = runs.find((run) => run.id === id);
    if (!original) return;
    setRetryHistory((current) => [...current, original]);
    setRuns((current) =>
      current.map((run) =>
        run.id === id
          ? {
              ...run,
              id: `${run.id}-retry`,
              title: "Preparing remaining catalog cards",
              status: "running",
              message: "Working through 22 remaining cards",
              count: { completed: 0, total: 22, unit: "cards" },
              retry: undefined,
              issue: undefined,
            }
          : run,
      ),
    );
  }
  const savedAds = runs.some(
    (run) => run.id === "ads" && run.status === "succeeded",
  )
    ? 11
    : scenario === "Import"
      ? 0
      : 8;
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-b bg-muted/20 px-6 py-5">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/lab/performance-board"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
          >
            <ArrowLeft className="size-3" />
            Performance vision board
          </Link>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold">Shared workflow activity</h1>
            <div className="flex gap-2">
              {(["Preview", "Data model"] as const).map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={view === item ? "secondary" : "ghost"}
                  aria-pressed={view === item}
                  onClick={() => setView(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Interactive proposal · sample data · no database writes or
            generation calls.
          </p>
          {view === "Preview" && (
            <div
              className="mt-4 flex flex-wrap gap-2"
              role="group"
              aria-label="Scenario"
            >
              {(Object.keys(scenarios) as Scenario[]).map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={scenario === item ? "secondary" : "outline"}
                  aria-pressed={scenario === item}
                  onClick={() => choose(item)}
                >
                  {item}
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                disabled={
                  !runs.some(
                    (run) => run.id === "ads" && run.status === "running",
                  )
                }
                onClick={completeAds}
              >
                Complete ad generation
              </Button>
            </div>
          )}
        </div>
      </header>
      <div className="@container mx-auto max-w-6xl px-6 py-8">
        {view === "Data model" ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">workflow_run</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Proposed replacement for creative_run. One row per execution
                attempt; shared progress and lifecycle, typed workflow-specific
                inputs.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-3">
              {[
                [
                  "Owned by",
                  "Organization → Brand → Runs",
                  "Optional campaign, document and content context.",
                ],
                [
                  "Related runs",
                  "Parent run → Child runs",
                  "An import owns its catalog preparation. Retry links to its prior attempt.",
                ],
                [
                  "Produces",
                  "Runs → Domain records",
                  "Ads, creative documents, media assets and catalog exports survive their job history.",
                ],
              ].map(([title, relation, detail]) => (
                <div key={title} className="rounded-xl border p-4">
                  <p className="text-xs text-muted-foreground">{title}</p>
                  <p className="mt-2 text-sm font-medium">{relation}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="p-3">Purpose</th>
                    <th className="p-3">Columns</th>
                    <th className="p-3">Contract</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map(([label, fields, description]) => (
                    <tr key={label} className="border-b last:border-0">
                      <th className="p-3 align-top font-medium">{label}</th>
                      <td className="p-3 align-top font-mono text-xs">
                        {fields}
                      </td>
                      <td className="p-3 align-top text-muted-foreground">
                        {description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2">
              <div className="rounded-xl border p-4">
                <h3 className="font-medium">
                  production_packet remains the creative document
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  One document can have many runs. It still owns its content,
                  brief and review state. A completed run may produce candidates
                  that need review before acceptance.
                </p>
              </div>
              <div className="rounded-xl border p-4">
                <h3 className="font-medium">
                  catalog_export becomes a durable artifact
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Move frozen feed rows, input snapshot and rendered asset
                  references out of providerOutput. An export keeps its own
                  identity when its source run is removed.
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Dispatch, leases and provider reconciliation are explicit
              execution responsibilities. Resume is offered only when a handler
              can safely continue from its checkpoint. Existing pregen builds
              and audience snapshots can adapt to this UI without changing their
              tables.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">
                  Performance / Clients
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  Porchlit Properties
                </h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHistory(!history)}
                aria-expanded={history}
              >
                Activity history
              </Button>
            </div>
            <nav
              aria-label="Client preview"
              className="flex gap-6 overflow-x-auto border-b"
            >
              {(["WanderOS", "Catalog", "Ad studio", "Campaigns"] as const).map(
                (item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTab(item)}
                    aria-current={tab === item ? "page" : undefined}
                    className={`shrink-0 border-b-2 pb-3 text-sm ${tab === item ? "border-foreground font-medium" : "border-transparent text-muted-foreground"}`}
                  >
                    {item}
                  </button>
                ),
              )}
            </nav>
            <RunActivity
              key={scenario}
              runs={runs}
              onOpen={setTab}
              onContinue={continueRun}
            />
            {history && (
              <section
                aria-label="Activity history"
                className="rounded-xl border"
              >
                <h3 className="border-b px-4 py-3 text-sm font-medium">
                  Activity history
                </h3>
                <div className="divide-y">
                  {[...runs, ...retryHistory].map((run) => (
                    <div
                      key={run.id}
                      className="flex items-center gap-3 px-4 py-3 text-sm"
                    >
                      <StatusIcon status={run.status} />
                      <span className="flex-1">{run.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {run.status}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {tab === "Ad studio" ? (
              <WorkspaceCard
                title="Ads"
                icon={Images}
                count={savedAds}
                actions={
                  <span className="text-xs text-muted-foreground">
                    {savedAds} drafts · 0 approved
                  </span>
                }
              >
                {savedAds ? (
                  <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
                    {["Serenity Ridge", "Ridge Retreats", "Summer Breeze"].map(
                      (name) => (
                        <div key={name} className="rounded-lg border p-3">
                          <div className="flex aspect-square items-center justify-center rounded-md bg-muted/30">
                            <Images className="size-8 text-muted-foreground" />
                          </div>
                          <p className="mt-3 text-sm font-medium">{name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Static + carousel · Draft
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon={Images}
                    title="Create the first ad"
                  />
                )}
              </WorkspaceCard>
            ) : (
              <WorkspaceCard
                title={
                  tab === "Catalog"
                    ? "Catalog cards"
                    : tab === "WanderOS"
                      ? "Home groups"
                      : "Campaigns"
                }
                icon={Layers}
                count={tab === "Catalog" ? 164 : 1}
              >
                <div className="rounded-lg border p-5">
                  <p className="text-sm font-medium">
                    {tab === "Catalog"
                      ? "164 homes included"
                      : tab === "WanderOS"
                        ? "Featured homes · 5 homes"
                        : "October · Draft campaign"}
                  </p>
                </div>
              </WorkspaceCard>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
