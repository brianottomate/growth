"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
  Workflow,
} from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";

import { Button, ButtonLink } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { LifecycleWorkspace } from "@/server/db/schema";
import { useTRPC } from "@/trpc/react";
import { ProgramDialog, type ProgramDraft } from "./ProgramDialog";
import { StepDialog, type StepDraft } from "./StepDialog";

const COVERAGE = {
  covered: { label: "Covered", cls: "text-emerald-300", dot: "bg-emerald-400" },
  partial: { label: "Partial", cls: "text-amber-300", dot: "bg-amber-400" },
  gap: { label: "Gap", cls: "text-red-300", dot: "bg-red-400" },
};

const RUN_DOT: Record<string, string> = {
  running: "bg-emerald-400",
  paused: "bg-amber-400",
  needs_fixing: "bg-red-400",
  planned: "bg-sky-400",
  draft: "bg-muted-foreground",
  stopped: "bg-muted-foreground",
  ended: "bg-muted-foreground",
};

const KIND_LABEL: Record<string, string> = {
  onboarding: "Onboarding",
  abandoned_cart: "Abandoned cart",
  reactivation: "Reactivation",
  revival: "Revival",
  transactional: "Transactional",
  behavioral: "Behavioral",
  broadcast: "Broadcast",
  outbound: "Outbound",
  other: "Other",
};

const PRIORITY_LABEL: Record<string, string> = {
  must_have: "Must have",
  should_have: "Should have",
  nice_to_have: "Nice to have",
};

const STEP_STATUS = {
  active: { dot: "bg-emerald-400", title: "Active" },
  planned: { dot: "bg-sky-400", title: "Planned" },
  missing: { dot: "bg-red-400", title: "Missing" },
};

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  push: "Push",
  in_app: "In app",
  bdr_task: "BDR task",
  slack: "Slack",
  webhook: "Webhook",
  other: "Other",
};

export const SYSTEM_LABEL: Record<string, string> = {
  customerio: "CIO",
  resend: "Resend",
  postmark: "Postmark",
  outreach: "Outreach",
  amplitude: "Amplitude",
  system: "Product",
  human: "Human",
  other: "Other",
};

const WORKSPACE_LABEL: Record<string, string> = {
  marketplace: "Marketplace",
  os: "WanderOS",
  shared: "Shared",
};

const WORKSPACE_CLS: Record<string, string> = {
  marketplace: "bg-sky-500/15 text-sky-300",
  os: "bg-violet-500/15 text-violet-300",
  shared: "bg-teal-500/15 text-teal-300",
};

const COVERAGE_ORDER = ["gap", "partial", "covered"];
const PRIORITY_ORDER = ["must_have", "should_have", "nice_to_have"];

/**
 * Order steps for display: main-path roots in timeline order, each followed
 * by its branch subtree (depth = indent level). Orphaned/cyclic parents fall
 * back to the main path so nothing silently disappears.
 */
function flattenSteps<T extends { id: string; parentStepId: string | null }>(
  steps: T[],
): { step: T; depth: number }[] {
  const ids = new Set(steps.map((s) => s.id));
  const children = new Map<string | null, T[]>();
  for (const s of steps) {
    const key =
      s.parentStepId && ids.has(s.parentStepId) ? s.parentStepId : null;
    children.set(key, [...(children.get(key) ?? []), s]);
  }
  const out: { step: T; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    for (const s of children.get(parentId) ?? []) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push({ step: s, depth });
      walk(s.id, depth + 1);
    }
  };
  walk(null, 0);
  for (const s of steps) {
    if (!seen.has(s.id)) out.push({ step: s, depth: 0 });
  }
  return out;
}

/** Human label for a step's offset-from-start (or a free-text override). */
function formatDelay(
  min: number | null | undefined,
  label: string | null | undefined,
): string | null {
  if (label) return label;
  if (min == null) return null;
  if (min === 0) return "Day 0";
  if (min % 1440 === 0) return `Day ${min / 1440}`;
  if (min % 60 === 0) return `${min / 60}h`;
  return `${min}m`;
}

export function LifecycleStrategy({
  brands,
}: {
  brands: { id: string; name: string }[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(trpc.lifecycle.overview.queryOptions());

  const [programOpen, setProgramOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<ProgramDraft>();
  const [stepOpen, setStepOpen] = useState(false);
  const [stepProgramId, setStepProgramId] = useState("");
  const [editingStep, setEditingStep] = useState<StepDraft>();
  // Workspace filter, plus a cross-cutting "outbound" (sales) filter on kind.
  // Persisted + enforced in ?filter= via nuqs (invalid values fall back to "all").
  const [wsFilter, setWsFilter] = useQueryState(
    "filter",
    parseAsStringLiteral([
      "all",
      "marketplace",
      "os",
      "shared",
      "outbound",
    ] as const).withDefault("all"),
  );

  // Step bodies expanded inline (by step id), so you can read/copy without the
  // edit dialog. One set across programs — step ids are globally unique.
  const [openBodies, setOpenBodies] = useState<Set<string>>(new Set());
  const toggleBody = (id: string) =>
    setOpenBodies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.lifecycle.overview.queryOptions());

  const removeProgram = useMutation(
    trpc.lifecycle.deleteProgram.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message || "Failed to delete"),
    }),
  );
  const removeStep = useMutation(
    trpc.lifecycle.deleteStep.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message || "Failed to delete step"),
    }),
  );

  if (isLoading) {
    return <p className="text-muted-foreground mt-8 text-sm">Loading…</p>;
  }

  const allPrograms = [...(data?.programs ?? [])].sort((a, b) => {
    const c =
      COVERAGE_ORDER.indexOf(a.coverage) - COVERAGE_ORDER.indexOf(b.coverage);
    if (c !== 0) return c;
    return (
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
    );
  });
  const programs =
    wsFilter === "all"
      ? allPrograms
      : wsFilter === "outbound"
        ? allPrograms.filter((p) => p.kind === "outbound")
        : allPrograms.filter((p) => p.workspace === wsFilter);
  const campaigns = data?.campaigns ?? [];
  const gaps = programs.filter((p) => p.coverage === "gap").length;
  const wsCount = (ws: LifecycleWorkspace) =>
    allPrograms.filter((p) => p.workspace === ws).length;
  const outboundCount = allPrograms.filter((p) => p.kind === "outbound").length;

  function openCreateProgram() {
    setEditingProgram(undefined);
    setProgramOpen(true);
  }
  function openAddStep(programId: string) {
    setStepProgramId(programId);
    setEditingStep(undefined);
    setStepOpen(true);
  }

  return (
    <div>
      <div className="mt-1 flex items-start justify-between">
        <p className="text-muted-foreground text-sm">
          The journeys we <em>want</em> — laid out step by step.{" "}
          {gaps > 0 && (
            <span className="text-red-300">
              {gaps} gap{gaps === 1 ? "" : "s"}
            </span>
          )}
        </p>
        <Button
          size="sm"
          onClick={openCreateProgram}
          disabled={brands.length === 0}
        >
          <Plus className="size-4" />
          New program
        </Button>
      </div>

      {/* Workspace filter */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(
          [
            ["all", `All · ${allPrograms.length}`],
            ["marketplace", `Marketplace · ${wsCount("marketplace")}`],
            ["os", `WanderOS · ${wsCount("os")}`],
            ["shared", `Shared · ${wsCount("shared")}`],
            ["outbound", `Outbound · ${outboundCount}`],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => void setWsFilter(v)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              wsFilter === v
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:bg-accent/40"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {programs.length === 0 && (
        <div className="text-muted-foreground mt-10 rounded-xl border border-dashed p-8 text-center text-sm">
          No programs yet. Add a journey you want to run, then lay out its steps
          — emails, BDR tasks, Slack nudges.
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {programs.map((p) => {
          const cov = COVERAGE[p.coverage] ?? COVERAGE.gap;
          return (
            <div key={p.id} className="bg-card rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${WORKSPACE_CLS[p.workspace] ?? ""}`}
                    >
                      {WORKSPACE_LABEL[p.workspace] ?? p.workspace}
                    </span>
                    <span className="border-border text-muted-foreground rounded-full border px-1.5 py-0.5 text-[10px] font-medium">
                      {KIND_LABEL[p.kind] ?? p.kind}
                    </span>
                    <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                      {PRIORITY_LABEL[p.priority] ?? p.priority}
                    </span>
                    <span
                      className={`flex items-center gap-1 text-[11px] font-medium ${cov.cls}`}
                    >
                      <span className={`size-1.5 rounded-full ${cov.dot}`} />
                      {cov.label}
                      {p.targetTouchpoints != null && (
                        <span className="text-muted-foreground">
                          {" "}
                          {p.steps.length}/{p.targetTouchpoints}
                        </span>
                      )}
                    </span>
                  </div>
                  {p.description && (
                    <p className="text-muted-foreground mt-1 text-sm">
                      {p.description}
                    </p>
                  )}
                  {p.intendedTrigger && (
                    <div className="text-muted-foreground mt-1.5 text-[11px]">
                      ⚡ {p.intendedTrigger}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <ButtonLink
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    title="Flow view"
                    href={`/app/lifecycle/${p.id}`}
                  >
                    <Workflow className="size-3.5" />
                  </ButtonLink>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => {
                      setEditingProgram({
                        id: p.id,
                        brandId: p.brandId,
                        name: p.name,
                        description: p.description,
                        kind: p.kind,
                        status: p.status,
                        priority: p.priority,
                        workspace: p.workspace,
                        intendedTrigger: p.intendedTrigger,
                        intendedChannels: p.intendedChannels,
                        targetTouchpoints: p.targetTouchpoints,
                      });
                      setProgramOpen(true);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => {
                      if (confirm(`Delete program "${p.name}"?`)) {
                        removeProgram.mutate({ id: p.id });
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              {/* Authored steps — the intended journey (branches indented) */}
              <div className="mt-3 space-y-1.5 border-t pt-3">
                {(() => {
                  const bodyStepIds = p.steps
                    .filter((s) => s.subject || s.body)
                    .map((s) => s.id);
                  const allOpen =
                    bodyStepIds.length > 0 &&
                    bodyStepIds.every((id) => openBodies.has(id));
                  const toggleAll = () =>
                    setOpenBodies((prev) => {
                      const next = new Set(prev);
                      if (allOpen) bodyStepIds.forEach((id) => next.delete(id));
                      else bodyStepIds.forEach((id) => next.add(id));
                      return next;
                    });
                  let mainIdx = 0;
                  return (
                    <>
                      {bodyStepIds.length > 0 && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={toggleAll}
                            className="text-muted-foreground hover:text-foreground text-[11px]"
                          >
                            {allOpen ? "Collapse all" : "Open all bodies"}
                          </button>
                        </div>
                      )}
                      {flattenSteps(p.steps).map(({ step: s, depth }) => {
                        const hasContent = Boolean(s.subject || s.body);
                        const open = openBodies.has(s.id);
                        return (
                          <div
                            key={s.id}
                            style={
                              depth > 0
                                ? { marginLeft: depth * 24 }
                                : undefined
                            }
                          >
                            <div className="bg-background/50 group flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5">
                              {depth === 0 ? (
                                <span className="text-muted-foreground w-4 text-center text-[11px] tabular-nums">
                                  {++mainIdx}
                                </span>
                              ) : (
                                <CornerDownRight className="text-muted-foreground size-3.5 w-4 shrink-0" />
                              )}
                              <span
                                className={`size-2 shrink-0 rounded-full ${(STEP_STATUS[s.status] ?? STEP_STATUS.planned).dot}`}
                                title={
                                  (STEP_STATUS[s.status] ?? STEP_STATUS.planned)
                                    .title
                                }
                              />
                              <span className="border-border text-muted-foreground rounded border px-1.5 py-0.5 text-[10px] font-medium">
                                {CHANNEL_LABEL[s.channel] ?? s.channel}
                              </span>
                              {s.system && (
                                <span className="bg-accent rounded px-1.5 py-0.5 text-[10px] font-medium">
                                  {SYSTEM_LABEL[s.system] ?? s.system}
                                </span>
                              )}
                              {hasContent ? (
                                <button
                                  type="button"
                                  onClick={() => toggleBody(s.id)}
                                  className="hover:text-foreground flex min-w-0 items-center gap-1 text-left text-sm"
                                  title="Show subject + body"
                                >
                                  {open ? (
                                    <ChevronDown className="size-3 shrink-0" />
                                  ) : (
                                    <ChevronRight className="size-3 shrink-0" />
                                  )}
                                  <span className="truncate">{s.name}</span>
                                </button>
                              ) : (
                                <span className="truncate text-sm">
                                  {s.name}
                                </span>
                              )}
                              {depth > 0 && s.branchLabel && (
                                <span className="text-muted-foreground rounded border border-dashed px-1.5 py-0.5 text-[10px] italic">
                                  {s.branchLabel}
                                </span>
                              )}
                              {formatDelay(s.delayMinutes, s.delayLabel) && (
                                <span className="text-muted-foreground text-[11px]">
                                  {formatDelay(s.delayMinutes, s.delayLabel)}
                                </span>
                              )}
                              {s.url && (
                                <a
                                  href={s.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-muted-foreground hover:text-foreground"
                                  title={s.url}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="size-3" />
                                </a>
                              )}
                              {s.campaign && (
                                <span
                                  className="text-muted-foreground ml-1 flex items-center gap-1 text-[10px]"
                                  title={`Delivered by ${s.campaign.name}`}
                                >
                                  <span
                                    className={`size-1.5 rounded-full ${RUN_DOT[s.campaign.runState] ?? "bg-muted-foreground"}`}
                                  />
                                  via CIO
                                </span>
                              )}
                              <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-6"
                                  onClick={() => {
                                    setStepProgramId(p.id);
                                    setEditingStep({
                                      id: s.id,
                                      programId: p.id,
                                      name: s.name,
                                      channel: s.channel,
                                      status: s.status,
                                      system: s.system,
                                      delayMinutes: s.delayMinutes,
                                      subject: s.subject,
                                      body: s.body,
                                      url: s.url,
                                      campaignId: s.campaignId,
                                      parentStepId: s.parentStepId,
                                      branchLabel: s.branchLabel,
                                    });
                                    setStepOpen(true);
                                  }}
                                >
                                  <Pencil className="size-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-6"
                                  onClick={() => removeStep.mutate({ id: s.id })}
                                >
                                  <Trash2 className="size-3" />
                                </Button>
                              </div>
                            </div>
                            {open && hasContent && (
                              <div className="bg-background/30 mt-1 ml-6 rounded-lg border px-3 py-2 text-xs">
                                {s.subject && (
                                  <div className="text-foreground/90 font-medium">
                                    Subject: {s.subject}
                                  </div>
                                )}
                                {s.body && (
                                  <pre className="text-muted-foreground mt-1 font-sans whitespace-pre-wrap">
                                    {s.body}
                                  </pre>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  );
                })()}

                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground h-8 w-full justify-start"
                  onClick={() => openAddStep(p.id)}
                >
                  <Plus className="size-3.5" />
                  Add step
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <ProgramDialog
        open={programOpen}
        onOpenChange={setProgramOpen}
        brands={brands}
        initial={editingProgram}
      />
      <StepDialog
        open={stepOpen}
        onOpenChange={setStepOpen}
        programId={stepProgramId}
        campaigns={campaigns.filter(
          (c) =>
            c.brandId ===
            allPrograms.find((p) => p.id === stepProgramId)?.brandId,
        )}
        steps={(
          allPrograms.find((p) => p.id === stepProgramId)?.steps ?? []
        ).map((s) => ({ id: s.id, name: s.name }))}
        initial={editingStep}
      />
    </div>
  );
}
