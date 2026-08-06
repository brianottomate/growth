"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Background,
  Controls,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  Handle,
  Position,
  type NodeProps,
  BackgroundVariant,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  PHASES,
  STREAMS,
  SUPPRESSION_RULES,
  CONFLICT_ZONES,
  TOOLS,
  STREAM_MAP,
  PHASE_MAP,
  type PhaseId,
  type MessageStream,
  type ConflictZone,
} from "@/data/message-streams";

// ─── Layout Constants ─────────────────────────────────────

const PHASE_WIDTH = 180;
const PHASE_GAP = 4;
const LANE_HEIGHT = 90;
const LANE_GAP = 8;
const HEADER_HEIGHT = 70;
const LANE_LABEL_WIDTH = 170;
const BLOCK_HEIGHT = 56;
const CONFLICT_SIZE = 24;

// ─── Build the graph ──────────────────────────────────────

function buildStreamGraph(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const totalHeight =
    HEADER_HEIGHT + STREAMS.length * (LANE_HEIGHT + LANE_GAP) + 80;

  // Phase columns (background bands)
  PHASES.forEach((phase, pi) => {
    const x = LANE_LABEL_WIDTH + pi * (PHASE_WIDTH + PHASE_GAP);
    nodes.push({
      id: `phase-${phase.id}`,
      type: "phase",
      position: { x, y: 0 },
      data: { ...phase, colWidth: PHASE_WIDTH, colHeight: totalHeight },
      draggable: false,
      selectable: false,
    });
  });

  // Stream lanes and active blocks
  STREAMS.forEach((stream, si) => {
    const laneY = HEADER_HEIGHT + si * (LANE_HEIGHT + LANE_GAP);

    // Lane label (left side)
    nodes.push({
      id: `lane-${stream.id}`,
      type: "lane",
      position: { x: 0, y: laneY },
      data: { ...stream },
      draggable: false,
      selectable: false,
    });

    // Active blocks for each phase this stream is in
    const activePhaseIndices = stream.activePhases
      .map((pid) => PHASES.findIndex((p) => p.id === pid))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);

    // Group consecutive phases into spans
    const spans: number[][] = [];
    for (const idx of activePhaseIndices) {
      const lastSpan = spans[spans.length - 1];
      const lastVal = lastSpan?.[lastSpan.length - 1];
      if (lastSpan && lastVal !== undefined && idx === lastVal + 1) {
        lastSpan.push(idx);
      } else {
        spans.push([idx]);
      }
    }

    spans.forEach((span, spanIdx) => {
      const firstIdx = span[0] ?? 0;
      const startX =
        LANE_LABEL_WIDTH + firstIdx * (PHASE_WIDTH + PHASE_GAP) + 8;
      const width = span.length * (PHASE_WIDTH + PHASE_GAP) - PHASE_GAP - 16;
      const y = laneY + (LANE_HEIGHT - BLOCK_HEIGHT) / 2;

      nodes.push({
        id: `block-${stream.id}-${spanIdx}`,
        type: "streamBlock",
        position: { x: startX, y },
        data: {
          stream,
          width,
          phases: span.map((i) => PHASES[i]),
        },
        draggable: false,
      });
    });
  });

  // Conflict zone markers
  CONFLICT_ZONES.forEach((cz) => {
    // Place at the intersection of the involved streams and phases
    const streamIndices = cz.streams
      .map((sid) => STREAMS.findIndex((s) => s.id === sid))
      .filter((i) => i >= 0);
    const phaseIndices = cz.phases
      .map((pid) => PHASES.findIndex((p) => p.id === pid))
      .filter((i) => i >= 0);

    if (streamIndices.length === 0 || phaseIndices.length === 0) return;

    // Place conflict marker at center of affected area
    const avgPhaseIdx =
      phaseIndices.reduce((a, b) => a + b, 0) / phaseIndices.length;
    const minStreamIdx = Math.min(...streamIndices);
    const maxStreamIdx = Math.max(...streamIndices);
    const avgStreamIdx = (minStreamIdx + maxStreamIdx) / 2;

    const x =
      LANE_LABEL_WIDTH +
      avgPhaseIdx * (PHASE_WIDTH + PHASE_GAP) +
      PHASE_WIDTH / 2 -
      CONFLICT_SIZE / 2;
    const y =
      HEADER_HEIGHT +
      avgStreamIdx * (LANE_HEIGHT + LANE_GAP) +
      LANE_HEIGHT / 2 -
      CONFLICT_SIZE / 2;

    nodes.push({
      id: `conflict-${cz.id}`,
      type: "conflict",
      position: { x, y },
      data: { ...cz },
      draggable: false,
    });
  });

  // Suppression rule edges
  SUPPRESSION_RULES.forEach((rule) => {
    const dominantIdx = STREAMS.findIndex((s) => s.id === rule.dominant);
    const suppressedIdx = STREAMS.findIndex((s) => s.id === rule.suppressed);
    if (dominantIdx < 0 || suppressedIdx < 0) return;

    // Find a stream block to connect from/to
    const dominantSpanId = `block-${rule.dominant}-0`;
    const suppressedSpanId = `block-${rule.suppressed}-0`;

    edges.push({
      id: `rule-${rule.id}`,
      source: dominantSpanId,
      target: suppressedSpanId,
      label: rule.severity === "hard" ? "SUPPRESSES" : "coordinates",
      type: "smoothstep",
      labelStyle: {
        fontSize: 8,
        fill: rule.severity === "hard" ? "#f87171" : "#fbbf24",
        fontWeight: 600,
      },
      labelBgStyle: {
        fill: "rgba(15,15,20,0.9)",
        fillOpacity: 0.9,
      },
      labelBgPadding: [4, 2] as [number, number],
      style: {
        stroke: rule.severity === "hard" ? "#f87171" : "#fbbf24",
        strokeWidth: rule.severity === "hard" ? 2 : 1.5,
        strokeDasharray: rule.severity === "soft" ? "6 3" : undefined,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 8,
        height: 8,
        color: rule.severity === "hard" ? "#f87171" : "#fbbf24",
      },
      animated: rule.severity === "hard",
      data: { rule },
    });
  });

  return { nodes, edges };
}

// ─── Custom Nodes ─────────────────────────────────────────

function PhaseNode({ data }: NodeProps) {
  const d = data as unknown as {
    id: PhaseId;
    label: string;
    description: string;
    durationHint?: string;
    colWidth: number;
    colHeight: number;
  };
  return (
    <div
      className="flex flex-col items-center"
      style={{ width: d.colWidth, height: d.colHeight }}
    >
      {/* Phase header */}
      <div className="z-10 flex w-full flex-col items-center py-3">
        <div className="text-[11px] font-bold text-white/80">{d.label}</div>
        {d.durationHint && (
          <div className="text-[9px] text-white/30">{d.durationHint}</div>
        )}
      </div>
      {/* Background band */}
      <div
        className="absolute inset-0 rounded-md"
        style={{
          background: "rgba(255,255,255,0.02)",
          borderLeft: "1px solid rgba(255,255,255,0.06)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
      />
    </div>
  );
}

function LaneNode({ data }: NodeProps) {
  const d = data as unknown as MessageStream;
  const tool = TOOLS[d.tool];
  return (
    <div
      className="flex items-center gap-2 pr-3"
      style={{ width: LANE_LABEL_WIDTH, height: LANE_HEIGHT }}
    >
      <div
        className="h-full w-1 rounded-full"
        style={{ background: d.color }}
      />
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-white">{d.label}</div>
        <div className="mt-0.5 flex items-center gap-1">
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: tool.color }}
          />
          <span className="text-[9px] text-white/30">{tool.label}</span>
        </div>
        <div className="mt-0.5 text-[9px] text-white/25">{d.owner}</div>
      </div>
    </div>
  );
}

function StreamBlockNode({ data }: NodeProps) {
  const d = data as unknown as { stream: MessageStream; width: number };
  return (
    <div
      className="relative flex items-center rounded-lg border px-3 shadow-sm"
      style={{
        width: d.width,
        height: BLOCK_HEIGHT,
        background: `${d.stream.color}15`,
        borderColor: `${d.stream.color}40`,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: d.stream.color,
          border: "none",
          width: 6,
          height: 6,
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] font-medium text-white/70">
          {d.stream.trigger}
        </div>
        <div className="mt-0.5 text-[9px] text-white/30">
          Exit: {d.stream.exitCriteria[0]}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: d.stream.color,
          border: "none",
          width: 6,
          height: 6,
        }}
      />
    </div>
  );
}

function ConflictNode({ data }: NodeProps) {
  const d = data as unknown as ConflictZone;
  const statusColors = {
    resolved: "#10b981",
    "needs-rules": "#f59e0b",
    unknown: "#ef4444",
  };
  return (
    <div
      className="flex cursor-pointer items-center justify-center rounded-full border-2 shadow-lg"
      style={{
        width: CONFLICT_SIZE,
        height: CONFLICT_SIZE,
        background: `${statusColors[d.status]}20`,
        borderColor: statusColors[d.status],
      }}
      title={d.risk}
    >
      <span
        className="text-[10px] font-bold"
        style={{ color: statusColors[d.status] }}
      >
        !
      </span>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  phase: PhaseNode,
  lane: LaneNode,
  streamBlock: StreamBlockNode,
  conflict: ConflictNode,
};

// ─── Detail Panels ────────────────────────────────────────

function StreamDetail({
  stream,
  onClose,
}: {
  stream: MessageStream;
  onClose: () => void;
}) {
  const tool = TOOLS[stream.tool];
  const suppressions = SUPPRESSION_RULES.filter(
    (r) => r.dominant === stream.id || r.suppressed === stream.id,
  );
  const conflicts = CONFLICT_ZONES.filter((c) => c.streams.includes(stream.id));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full"
            style={{ background: stream.color }}
          />
          <h2 className="text-sm font-semibold text-white">{stream.label}</h2>
        </div>
        <button
          onClick={onClose}
          className="text-sm text-white/30 hover:text-white/70"
        >
          x
        </button>
      </div>

      <p className="text-xs text-white/60">{stream.description}</p>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded bg-white/5 p-2">
          <div className="text-[9px] font-bold text-white/30 uppercase">
            Tool
          </div>
          <div className="mt-1 flex items-center gap-1">
            <div
              className="h-2 w-2 rounded-full"
              style={{ background: tool.color }}
            />
            <span className="text-[11px] text-white/70">{tool.label}</span>
          </div>
        </div>
        <div className="rounded bg-white/5 p-2">
          <div className="text-[9px] font-bold text-white/30 uppercase">
            Type
          </div>
          <div className="mt-1 text-[11px] text-white/70">{stream.type}</div>
        </div>
        <div className="col-span-2 rounded bg-white/5 p-2">
          <div className="text-[9px] font-bold text-white/30 uppercase">
            Owner
          </div>
          <div className="mt-1 text-[11px] text-white/70">{stream.owner}</div>
        </div>
      </div>

      <div>
        <div className="mb-1 text-[9px] font-bold text-white/30 uppercase">
          Trigger
        </div>
        <div className="rounded border border-blue-500/20 bg-blue-900/20 p-2 text-[10px] text-blue-300">
          {stream.trigger}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[9px] font-bold text-white/30 uppercase">
          Exit Criteria
        </div>
        <div className="space-y-1">
          {stream.exitCriteria.map((ec, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 text-[10px] text-white/50"
            >
              <span className="text-white/20">-</span> {ec}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[9px] font-bold text-white/30 uppercase">
          Active Phases
        </div>
        <div className="flex flex-wrap gap-1">
          {stream.activePhases.map((p) => (
            <span
              key={p}
              className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-white/50"
            >
              {PHASE_MAP[p].label}
            </span>
          ))}
        </div>
      </div>

      {stream.messages && (
        <div>
          <div className="mb-1 text-[9px] font-bold text-white/30 uppercase">
            Messages ({stream.messages.length})
          </div>
          <div className="space-y-1">
            {stream.messages.map((msg, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 text-[10px] text-white/50"
              >
                <span className="text-white/20">{i + 1}.</span> {msg}
              </div>
            ))}
          </div>
        </div>
      )}

      {suppressions.length > 0 && (
        <div>
          <div className="mb-2 text-[9px] font-bold text-white/30 uppercase">
            Suppression Rules
          </div>
          <div className="space-y-2">
            {suppressions.map((rule) => {
              const isDominant = rule.dominant === stream.id;
              return (
                <div
                  key={rule.id}
                  className={`rounded border p-2 text-[10px] ${
                    rule.severity === "hard"
                      ? "border-red-500/30 bg-red-900/20 text-red-300"
                      : "border-amber-500/30 bg-amber-900/20 text-amber-300"
                  }`}
                >
                  <div className="font-medium">
                    {isDominant ? "Suppresses" : "Suppressed by"}{" "}
                    {
                      STREAM_MAP[isDominant ? rule.suppressed : rule.dominant]
                        .label
                    }
                  </div>
                  <div className="mt-0.5 text-[9px] opacity-70">
                    {rule.condition}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {conflicts.length > 0 && (
        <div>
          <div className="mb-2 text-[9px] font-bold text-white/30 uppercase">
            Conflict Zones
          </div>
          <div className="space-y-2">
            {conflicts.map((cz) => (
              <div
                key={cz.id}
                className={`rounded border p-2 text-[10px] ${
                  cz.status === "needs-rules"
                    ? "border-amber-500/30 bg-amber-900/20"
                    : cz.status === "resolved"
                      ? "border-green-500/30 bg-green-900/20"
                      : "border-red-500/30 bg-red-900/20"
                }`}
              >
                <div className="font-medium text-white/70">{cz.risk}</div>
                <div className="mt-1 text-[9px] text-white/40">
                  Resolution: {cz.resolution}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConflictDetail({
  conflict,
  onClose,
}: {
  conflict: ConflictZone;
  onClose: () => void;
}) {
  const statusLabels = {
    resolved: "Resolved",
    "needs-rules": "Needs Rules",
    unknown: "Unknown",
  };
  const statusColors = {
    resolved: "#10b981",
    "needs-rules": "#f59e0b",
    unknown: "#ef4444",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <span
          className="rounded px-2 py-0.5 text-[10px] font-bold uppercase"
          style={{
            background: `${statusColors[conflict.status]}20`,
            color: statusColors[conflict.status],
          }}
        >
          {statusLabels[conflict.status]}
        </span>
        <button
          onClick={onClose}
          className="text-sm text-white/30 hover:text-white/70"
        >
          x
        </button>
      </div>

      <div>
        <div className="mb-1 text-[9px] font-bold text-white/30 uppercase">
          Risk
        </div>
        <p className="text-xs text-red-300/80">{conflict.risk}</p>
      </div>

      <div>
        <div className="mb-1 text-[9px] font-bold text-white/30 uppercase">
          Resolution
        </div>
        <p className="text-xs text-white/60">{conflict.resolution}</p>
      </div>

      <div>
        <div className="mb-1 text-[9px] font-bold text-white/30 uppercase">
          Involved Streams
        </div>
        <div className="space-y-1">
          {conflict.streams.map((sid) => {
            const s = STREAM_MAP[sid];
            return (
              <div key={sid} className="flex items-center gap-2 text-[10px]">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="text-white/60">{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[9px] font-bold text-white/30 uppercase">
          Affected Phases
        </div>
        <div className="flex flex-wrap gap-1">
          {conflict.phases.map((pid) => (
            <span
              key={pid}
              className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-white/50"
            >
              {PHASE_MAP[pid].label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Overview Panel ───────────────────────────────────────

function OverviewPanel() {
  const needsRules = CONFLICT_ZONES.filter(
    (c) => c.status === "needs-rules",
  ).length;
  const hardRules = SUPPRESSION_RULES.filter(
    (r) => r.severity === "hard",
  ).length;
  const softRules = SUPPRESSION_RULES.filter(
    (r) => r.severity === "soft",
  ).length;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-[10px] font-bold tracking-wider text-white/40 uppercase">
          Summary
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-white/5 p-2.5">
            <div className="text-lg font-bold text-white">{STREAMS.length}</div>
            <div className="text-[10px] text-white/40">Streams</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2.5">
            <div className="text-lg font-bold text-white">{PHASES.length}</div>
            <div className="text-[10px] text-white/40">Phases</div>
          </div>
          <div className="rounded-lg bg-amber-900/30 p-2.5">
            <div className="text-lg font-bold text-amber-300">{needsRules}</div>
            <div className="text-[10px] text-amber-300/60">Conflict Zones</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2.5">
            <div className="text-lg font-bold text-white">
              {hardRules + softRules}
            </div>
            <div className="text-[10px] text-white/40">
              Rules ({hardRules}H / {softRules}S)
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-[10px] font-bold tracking-wider text-white/40 uppercase">
          Conflict Zones
        </h3>
        <div className="space-y-2">
          {CONFLICT_ZONES.map((cz) => {
            const statusColors = {
              resolved: "text-green-300 bg-green-900/20",
              "needs-rules": "text-amber-300 bg-amber-900/20",
              unknown: "text-red-300 bg-red-900/20",
            };
            return (
              <div
                key={cz.id}
                className={`rounded p-2 ${statusColors[cz.status]}`}
              >
                <div className="text-[10px] font-medium">{cz.risk}</div>
                <div className="mt-1 flex gap-1">
                  {cz.streams.map((sid) => (
                    <span
                      key={sid}
                      className="rounded bg-white/10 px-1 py-0.5 text-[8px]"
                    >
                      {STREAM_MAP[sid].label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-[10px] font-bold tracking-wider text-white/40 uppercase">
          Suppression Rules
        </h3>
        <div className="space-y-1.5">
          {SUPPRESSION_RULES.map((rule) => (
            <div
              key={rule.id}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-[10px] ${
                rule.severity === "hard"
                  ? "bg-red-900/20 text-red-300"
                  : "bg-amber-900/20 text-amber-300"
              }`}
            >
              <span className="text-[8px] font-bold uppercase">
                {rule.severity}
              </span>
              <span>{STREAM_MAP[rule.dominant].label}</span>
              <span className="text-white/20">-&gt;</span>
              <span>{STREAM_MAP[rule.suppressed].label}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-[10px] font-bold tracking-wider text-white/40 uppercase">
          Tool Ownership
        </h3>
        <div className="space-y-1.5">
          {STREAMS.map((s) => {
            const tool = TOOLS[s.tool];
            return (
              <div
                key={s.id}
                className="flex items-center justify-between rounded bg-white/5 px-2.5 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ background: s.color }}
                  />
                  <span className="text-[10px] text-white/70">{s.label}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: tool.color }}
                  />
                  <span className="text-[9px] text-white/30">{tool.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

type Selection =
  | { type: "stream"; stream: MessageStream }
  | { type: "conflict"; conflict: ConflictZone }
  | null;

function MessageStreamsInner() {
  const { nodes: initNodes, edges: initEdges } = useMemo(
    () => buildStreamGraph(),
    [],
  );
  const [nodes, , onNodesChange] = useNodesState<Node>(initNodes);
  const [edges, , onEdgesChange] = useEdgesState<Edge>(initEdges);
  const [selection, setSelection] = useState<Selection>(null);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === "streamBlock") {
        const d = node.data as unknown as { stream: MessageStream };
        setSelection({ type: "stream", stream: d.stream });
      } else if (node.type === "conflict") {
        const d = node.data as unknown as ConflictZone;
        setSelection({ type: "conflict", conflict: d });
      } else if (node.type === "lane") {
        const d = node.data as unknown as MessageStream;
        setSelection({ type: "stream", stream: d });
      }
    },
    [],
  );

  return (
    <div className="flex h-full flex-col bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold text-white">Message Streams</h1>
          <p className="text-[10px] text-white/30">
            Concurrent communication streams across a single user lifecycle
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded bg-amber-900/30 px-2.5 py-1 text-[10px] text-amber-300">
            {CONFLICT_ZONES.filter((c) => c.status === "needs-rules").length}{" "}
            conflicts need rules
          </div>
          <div className="flex items-center gap-4 text-[9px]">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-6 rounded-sm bg-red-400/60" />
              <span className="text-white/30">hard suppress</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-px w-6 border-t-2 border-dashed border-amber-400/60" />
              <span className="text-white/30">soft coordinate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex h-4 w-4 items-center justify-center rounded-full border border-amber-400 text-[8px] font-bold text-amber-400">
                !
              </div>
              <span className="text-white/30">conflict zone</span>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Graph */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            fitView
            fitViewOptions={{ padding: 0.08 }}
            minZoom={0.3}
            maxZoom={2}
            colorMode="dark"
            nodesDraggable={false}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="rgba(255,255,255,0.03)"
            />
            <Controls />
          </ReactFlow>
        </div>

        {/* Sidebar */}
        <div className="flex w-80 shrink-0 flex-col border-l border-white/10 bg-gray-900">
          <div className="flex-1 overflow-y-auto p-3">
            {selection === null && <OverviewPanel />}
            {selection?.type === "stream" && (
              <StreamDetail
                stream={selection.stream}
                onClose={() => setSelection(null)}
              />
            )}
            {selection?.type === "conflict" && (
              <ConflictDetail
                conflict={selection.conflict}
                onClose={() => setSelection(null)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MessageStreams() {
  return (
    <ReactFlowProvider>
      <MessageStreamsInner />
    </ReactFlowProvider>
  );
}
