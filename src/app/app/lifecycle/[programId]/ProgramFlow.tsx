"use client";

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ExternalLink, Zap } from "lucide-react";

import { applyDagreLayout } from "@/components/flow/dagre-layout";
import type {
  LifecycleRunState,
  LifecycleStepStatus,
  LifecycleStepSystem,
  TouchpointChannel,
} from "@/server/db/schema";

export type FlowStep = {
  id: string;
  name: string;
  channel: TouchpointChannel;
  status: LifecycleStepStatus;
  system: LifecycleStepSystem | null;
  delayMinutes: number | null;
  delayLabel: string | null;
  subject: string | null;
  url: string | null;
  parentStepId: string | null;
  branchLabel: string | null;
  campaign: { name: string; runState: LifecycleRunState } | null;
};

const NODE_WIDTH = 240;
const NODE_HEIGHT = 76;

const STATUS_META: Record<
  LifecycleStepStatus,
  { border: string; dot: string; label: string }
> = {
  active: { border: "#34d399", dot: "bg-emerald-400", label: "Active" },
  planned: { border: "#38bdf8", dot: "bg-sky-400", label: "Planned" },
  missing: { border: "#f87171", dot: "bg-red-400", label: "Missing" },
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

const SYSTEM_LABEL: Record<string, string> = {
  customerio: "CIO",
  resend: "Resend",
  postmark: "Postmark",
  outreach: "Outreach",
  amplitude: "Amplitude",
  system: "Product",
  human: "Human",
  other: "Other",
};

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

// ─── Custom nodes ─────────────────────────────────────────

function TriggerNode({ data }: NodeProps) {
  const d = data as unknown as { label: string };
  return (
    <div
      className="bg-card flex items-center gap-2 rounded-full border px-4 py-2 shadow-sm"
      style={{ minWidth: 160 }}
    >
      <Zap className="size-3.5 text-amber-400" />
      <span className="font-mono text-xs">{d.label}</span>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

function StepNode({ data }: NodeProps) {
  const s = data as unknown as FlowStep;
  const meta = STATUS_META[s.status] ?? STATUS_META.planned;
  return (
    <div
      className="bg-card rounded-lg border-2 px-3 py-2 shadow-sm"
      style={{ borderColor: meta.border, width: NODE_WIDTH }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="flex items-center gap-1.5">
        <span
          className={`size-2 shrink-0 rounded-full ${meta.dot}`}
          title={meta.label}
        />
        <span className="truncate text-xs font-semibold">{s.name}</span>
        {s.url && (
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground ml-auto"
            title={s.url}
          >
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      {s.subject && (
        <div className="text-muted-foreground mt-0.5 truncate text-[10px] italic">
          {s.subject}
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="border-border text-muted-foreground rounded border px-1 py-px text-[9px] font-medium">
          {CHANNEL_LABEL[s.channel] ?? s.channel}
        </span>
        {s.system && (
          <span className="bg-accent rounded px-1 py-px text-[9px] font-medium">
            {SYSTEM_LABEL[s.system] ?? s.system}
          </span>
        )}
        {s.campaign && (
          <span
            className="text-muted-foreground text-[9px]"
            title={`Delivered by ${s.campaign.name} (${s.campaign.runState})`}
          >
            via{" "}
            {s.campaign.name.length > 18
              ? `${s.campaign.name.slice(0, 18)}…`
              : s.campaign.name}
          </span>
        )}
        {formatDelay(s.delayMinutes, s.delayLabel) && (
          <span className="text-muted-foreground ml-auto text-[9px] tabular-nums">
            {formatDelay(s.delayMinutes, s.delayLabel)}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes: NodeTypes = { trigger: TriggerNode, step: StepNode };

// ─── Graph builder ────────────────────────────────────────

const EDGE_BASE = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
} as const;

function buildGraph(
  program: { intendedTrigger: string | null },
  steps: FlowStep[],
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const ids = new Set(steps.map((s) => s.id));

  // Roots (main path) keep their incoming sort order; branches hang off
  // their parent. A parent pointing at a missing step falls back to root.
  const isRoot = (s: FlowStep) => !s.parentStepId || !ids.has(s.parentStepId);
  const roots = steps.filter(isRoot);

  if (program.intendedTrigger) {
    nodes.push({
      id: "__trigger__",
      type: "trigger",
      position: { x: 0, y: 0 },
      data: { label: program.intendedTrigger },
    });
  }

  for (const s of steps) {
    nodes.push({
      id: s.id,
      type: "step",
      position: { x: 0, y: 0 },
      data: s as unknown as Record<string, unknown>,
    });
  }

  // Spine: trigger → root1 → root2 → …, labeled with the target's offset.
  let prev = program.intendedTrigger ? "__trigger__" : null;
  for (const r of roots) {
    if (prev) {
      edges.push({
        ...EDGE_BASE,
        id: `spine-${prev}-${r.id}`,
        source: prev,
        target: r.id,
        label: formatDelay(r.delayMinutes, r.delayLabel) ?? undefined,
        labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
        labelBgStyle: { fill: "var(--card)" },
        style: { strokeWidth: 1.5 },
      });
    }
    prev = r.id;
  }

  // Branches: parent → child, dashed, labeled with the condition.
  for (const s of steps) {
    if (isRoot(s)) continue;
    edges.push({
      ...EDGE_BASE,
      id: `branch-${s.parentStepId}-${s.id}`,
      source: s.parentStepId!,
      target: s.id,
      label: s.branchLabel ?? undefined,
      labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
      labelBgStyle: { fill: "var(--card)" },
      style: { strokeWidth: 1.5, strokeDasharray: "5 4" },
      animated: true,
    });
  }

  return {
    nodes: applyDagreLayout(nodes, edges, {
      direction: "TB",
      nodeWidth: NODE_WIDTH,
      nodeHeight: NODE_HEIGHT,
      ranksep: 56,
      nodesep: 48,
    }),
    edges,
  };
}

// ─── Component ────────────────────────────────────────────

export function ProgramFlow({
  program,
  steps,
}: {
  program: { name: string; intendedTrigger: string | null };
  steps: FlowStep[];
}) {
  const { nodes, edges } = useMemo(
    () => buildGraph(program, steps),
    [program, steps],
  );

  if (steps.length === 0) {
    return (
      <div className="text-muted-foreground mt-6 rounded-xl border border-dashed p-10 text-center text-sm">
        No steps yet — add steps on the Lifecycle page to see the flow.
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-1 flex-col overflow-hidden rounded-xl border">
      {/* Explicit height: ReactFlow sizes itself to 100% of this box, which
          doesn't resolve against a min-height-only parent. */}
      <div className="h-[max(440px,calc(100vh-300px))]">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
            maxZoom={1.75}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              className="opacity-40"
            />
            <Controls showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
      <div className="bg-card flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2">
        {Object.entries(STATUS_META).map(([k, m]) => (
          <span key={k} className="flex items-center gap-1.5 text-[10px]">
            <span className={`size-2 rounded-full ${m.dot}`} />
            <span className="text-muted-foreground">{m.label}</span>
          </span>
        ))}
        <span className="text-muted-foreground ml-2 border-l pl-4 text-[10px]">
          dashed = conditional branch
        </span>
      </div>
    </div>
  );
}
