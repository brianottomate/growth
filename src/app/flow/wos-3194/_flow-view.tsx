"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  type NodeTypes,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";

import {
  EDGES,
  type FlowEdge,
  type FlowNode,
  KIND_COLORS,
  type NodeKind,
  type NodeStatus,
  NODES,
  STAGE_COLORS,
  STAGE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/data/wos-3194";

// ─── Layout ─────────────────────────────────────────────

const NODE_WIDTH = 220;
const NODE_HEIGHT = 62;

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 110, nodesep: 26 });

  nodes.forEach((n) =>
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }),
  );
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });
}

// ─── Edge styles by type ────────────────────────────────

const EDGE_TYPE_STYLES: Record<
  string,
  { stroke: string; dasharray?: string; animated?: boolean }
> = {
  call: { stroke: "#64748b" },
  data: { stroke: "#8b5cf6", animated: true },
  missing: { stroke: "#ef4444", dasharray: "4 3" },
  proposed: { stroke: "#22c55e", dasharray: "6 3", animated: true },
};

// ─── Custom node ────────────────────────────────────────

function FlowNodeComponent({ data }: NodeProps) {
  const d = data as unknown as FlowNode & {
    kindColor: string;
    statusColor: string;
  };

  return (
    <div
      className="relative rounded-lg border-2 px-3 py-2 shadow-lg"
      style={{
        background: `${d.statusColor}14`,
        borderColor: d.statusColor,
        minWidth: NODE_WIDTH,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: d.statusColor, width: 6, height: 6 }}
      />
      <div className="flex items-start gap-2">
        <div
          className="mt-0.5 h-3 w-3 shrink-0 rounded-sm"
          style={{ background: d.kindColor }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold text-white">
            {d.label}
          </div>
          {d.description && (
            <div className="truncate text-[10px] text-white/55">
              {d.description}
            </div>
          )}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: d.statusColor, width: 6, height: 6 }}
      />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  flow: FlowNodeComponent,
};

// ─── Stage filter chip ──────────────────────────────────

function StageChip({
  stage,
  active,
  onClick,
}: {
  stage: number;
  active: boolean;
  onClick: () => void;
}) {
  const color = STAGE_COLORS[stage]!;
  return (
    <button
      onClick={onClick}
      className="rounded-md px-2.5 py-1 text-[11px] font-medium transition-all"
      style={{
        background: active ? `${color}30` : "transparent",
        color: active ? color : "rgba(255,255,255,0.4)",
        border: `1px solid ${active ? color : "rgba(255,255,255,0.1)"}`,
      }}
    >
      {STAGE_LABELS[stage]}
    </button>
  );
}

// ─── Detail panel ───────────────────────────────────────

function DetailPanel({
  node,
  connectedEdges,
  onClose,
}: {
  node: FlowNode;
  connectedEdges: FlowEdge[];
  onClose: () => void;
}) {
  const kindColor = KIND_COLORS[node.kind];
  const statusColor = STATUS_COLORS[node.status];

  return (
    <div className="w-96 shrink-0 overflow-y-auto border-l border-white/10 bg-gray-900 p-5">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
            style={{ background: `${kindColor}22`, color: kindColor }}
          >
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: kindColor }}
            />
            {node.kind}
          </div>
          <div
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
            style={{ background: `${statusColor}22`, color: statusColor }}
          >
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: statusColor }}
            />
            {STATUS_LABELS[node.status]}
          </div>
          <div
            className="rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              background: `${STAGE_COLORS[node.stage]}20`,
              color: STAGE_COLORS[node.stage],
            }}
          >
            Stage {node.stage}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-white/30 hover:text-white/70"
        >
          ✕
        </button>
      </div>

      <h2 className="mb-1 text-base font-semibold text-white">{node.label}</h2>
      {node.description && (
        <p className="mb-3 text-sm text-white/60">{node.description}</p>
      )}

      {node.path && (
        <div className="mb-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">
            Path
          </div>
          <code className="block break-all rounded bg-black/30 px-2 py-1.5 text-[11px] text-white/70">
            {node.path}
          </code>
        </div>
      )}

      {node.note && (
        <div className="mb-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">
            Notes
          </div>
          <p className="text-[13px] leading-relaxed text-white/70">
            {node.note}
          </p>
        </div>
      )}

      {connectedEdges.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">
            Connections
          </div>
          <div className="space-y-1.5">
            {connectedEdges.map((e) => {
              const isSource = e.source === node.id;
              const otherId = isSource ? e.target : e.source;
              const otherNode = NODES.find((n) => n.id === otherId);
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-2 text-xs text-white/50"
                >
                  <span className="text-white/20">
                    {isSource ? "→" : "←"}
                  </span>
                  <span className="text-white/70">
                    {otherNode?.label ?? otherId}
                  </span>
                  {e.label && (
                    <span className="text-white/30">({e.label})</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────

const ALL_STAGES = [1, 2, 3, 4, 5] as const;

function Wos3194Inner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [activeStages, setActiveStages] = useState<Set<number>>(
    new Set(ALL_STAGES),
  );

  const toggleStage = useCallback((stage: number) => {
    setActiveStages((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) {
        if (next.size > 1) next.delete(stage);
      } else {
        next.add(stage);
      }
      return next;
    });
  }, []);

  const buildGraph = useCallback(() => {
    const filteredNodes = NODES.filter((n) => activeStages.has(n.stage));
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = EDGES.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
    );

    const rfNodes: Node[] = filteredNodes.map((n) => ({
      id: n.id,
      type: "flow",
      position: { x: 0, y: 0 },
      data: {
        ...n,
        kindColor: KIND_COLORS[n.kind],
        statusColor: STATUS_COLORS[n.status],
      },
    }));

    const rfEdges: Edge[] = filteredEdges.map((e) => {
      const style =
        EDGE_TYPE_STYLES[e.type ?? "call"] ?? EDGE_TYPE_STYLES.call!;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        labelStyle: { fontSize: 9, fill: "rgba(255,255,255,0.55)" },
        labelBgStyle: { fill: "rgba(15,15,20,0.9)" },
        style: {
          stroke: style.stroke,
          strokeWidth: 1.5,
          strokeDasharray: style.dasharray,
        },
        animated: style.animated ?? false,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 8,
          height: 8,
          color: style.stroke,
        },
      };
    });

    const laid = applyDagreLayout(rfNodes, rfEdges);
    setNodes(laid);
    setEdges(rfEdges);
    setSelectedNode(null);
  }, [activeStages, setNodes, setEdges]);

  useEffect(() => {
    buildGraph();
  }, [buildGraph]);

  const connectedEdges = selectedNode
    ? EDGES.filter(
        (e) => e.source === selectedNode.id || e.target === selectedNode.id,
      )
    : [];

  return (
    <div className="flex h-screen flex-col bg-gray-950">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-white/10 px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-white">
              WOS-3194 — Search shows impossible-to-book dates
            </h1>
            <a
              href="https://linear.app/wander/issue/WOS-3194"
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-white/40 underline underline-offset-2 hover:text-white/70"
            >
              Linear
            </a>
          </div>
          <p className="mt-0.5 text-xs text-white/40">
            Search pipeline filters by calendar availability only — never by
            property-level stay rules (min/max nights, gap, lead time,
            allowed check-in days). Click any node for details.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {ALL_STAGES.map((stage) => (
            <StageChip
              key={stage}
              stage={stage}
              active={activeStages.has(stage)}
              onClick={() => toggleStage(stage)}
            />
          ))}
        </div>
      </div>

      {/* Graph + detail panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            onNodeClick={(_event: React.MouseEvent, node: Node) => {
              const found = NODES.find((n) => n.id === node.id);
              setSelectedNode(found ?? null);
            }}
            onPaneClick={() => setSelectedNode(null)}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.2}
            maxZoom={2}
            colorMode="dark"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="rgba(255,255,255,0.06)"
            />
            <Controls />
            <MiniMap
              nodeColor={(n) => {
                const found = NODES.find((p) => p.id === n.id);
                return found ? STATUS_COLORS[found.status] : "#666";
              }}
              maskColor="rgba(0,0,0,0.6)"
            />
          </ReactFlow>
        </div>

        {selectedNode && (
          <DetailPanel
            node={selectedNode}
            connectedEdges={connectedEdges}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 px-6 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
          Status
        </span>
        {(Object.entries(STATUS_COLORS) as [NodeStatus, string][]).map(
          ([status, color]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div
                className="h-2 w-2 rounded-full"
                style={{ background: color }}
              />
              <span className="text-[10px] text-white/50">
                {STATUS_LABELS[status]}
              </span>
            </div>
          ),
        )}
        <div className="ml-4 flex items-center gap-3 border-l border-white/10 pl-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
            Kind
          </span>
          {(Object.entries(KIND_COLORS) as [NodeKind, string][]).map(
            ([kind, color]) => (
              <div key={kind} className="flex items-center gap-1.5">
                <div
                  className="h-2 w-2 rounded-sm"
                  style={{ background: color }}
                />
                <span className="text-[10px] text-white/40">{kind}</span>
              </div>
            ),
          )}
        </div>
        <div className="ml-4 flex items-center gap-3 border-l border-white/10 pl-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
            Edges
          </span>
          {(
            Object.entries(EDGE_TYPE_STYLES) as [
              string,
              { stroke: string; dasharray?: string; animated?: boolean },
            ][]
          ).map(([type, style]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div
                className="h-px w-5"
                style={{
                  background: style.dasharray ? "transparent" : style.stroke,
                  borderTop: style.dasharray
                    ? `2px dashed ${style.stroke}`
                    : undefined,
                }}
              />
              <span className="text-[10px] text-white/40">{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FlowView() {
  return (
    <ReactFlowProvider>
      <Wos3194Inner />
    </ReactFlowProvider>
  );
}
