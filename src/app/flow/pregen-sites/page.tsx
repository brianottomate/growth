"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
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
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";

import {
  NODES,
  EDGES,
  KIND_COLORS,
  STAGE_LABELS,
  STAGE_COLORS,
  type PregenNode,
  type PregenEdge,
  type NodeKind,
} from "@/data/pregen-sites";

// ─── Layout ─────────────────────────────────────────────

const NODE_WIDTH = 172;
const NODE_HEIGHT = 52;

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 120, nodesep: 28 });

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
  data: { stroke: "#8b5cf6", animated: true },
  action: { stroke: "#3b82f6" },
  webhook: { stroke: "#f59e0b", dasharray: "6 3", animated: true },
  user: { stroke: "#10b981", animated: true },
};

// ─── Custom nodes ───────────────────────────────────────

function PregenNodeComponent({ data }: NodeProps) {
  const d = data as unknown as PregenNode & { color: string };
  const isDB = d.kind === "database";

  return (
    <div
      className={`relative rounded-lg border-2 px-3 py-2 shadow-lg ${isDB ? "ring-1 ring-white/10" : ""}`}
      style={{
        background: isDB ? `${d.color}28` : `${d.color}14`,
        borderColor: d.color,
        minWidth: NODE_WIDTH,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: d.color, width: 6, height: 6 }}
      />
      <div className="flex items-center gap-2">
        <div
          className="h-3 w-3 shrink-0 rounded-sm"
          style={{ background: d.color }}
        />
        <div className="min-w-0">
          <div className="truncate text-xs font-bold text-white">
            {d.label}
          </div>
          {d.description && (
            <div className="truncate text-[10px] text-white/50">
              {d.description}
            </div>
          )}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: d.color, width: 6, height: 6 }}
      />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  pregen: PregenNodeComponent,
};

// ─── Stage filter chips ─────────────────────────────────

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
  node: PregenNode;
  connectedEdges: PregenEdge[];
  onClose: () => void;
}) {
  const color = KIND_COLORS[node.kind];

  return (
    <div className="w-72 shrink-0 overflow-y-auto border-l border-white/10 bg-gray-900 p-5">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
            style={{ background: `${color}22`, color }}
          >
            <div className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
            {node.kind}
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
        <button onClick={onClose} className="text-white/30 hover:text-white/70">
          ✕
        </button>
      </div>

      <h2 className="mb-1 text-base font-semibold text-white">{node.label}</h2>
      {node.description && (
        <p className="mb-4 text-sm text-white/60">{node.description}</p>
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
                <div key={e.id} className="flex items-center gap-2 text-xs text-white/50">
                  <span className="text-white/20">{isSource ? "→" : "←"}</span>
                  <span className="text-white/70">{otherNode?.label ?? otherId}</span>
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

function PregenSitesInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<PregenNode | null>(null);
  const [activeStages, setActiveStages] = useState<Set<number>>(
    new Set([1, 2, 3, 4, 5]),
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
      type: "pregen",
      position: { x: 0, y: 0 },
      data: { ...n, color: KIND_COLORS[n.kind] },
    }));

    const rfEdges: Edge[] = filteredEdges.map((e) => {
      const style = EDGE_TYPE_STYLES[e.type ?? "data"] ?? EDGE_TYPE_STYLES.data!;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        labelStyle: { fontSize: 8, fill: "rgba(255,255,255,0.4)" },
        labelBgStyle: { fill: "rgba(15,15,20,0.85)" },
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
          <h1 className="text-sm font-semibold text-white">
            Pre-Generated Sites Pipeline
          </h1>
          <p className="mt-0.5 text-xs text-white/40">
            Build list → Qualify → Pre-generate → Outreach → Claim & Publish
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((stage) => (
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
              const pregenNode = NODES.find((n) => n.id === node.id);
              setSelectedNode(pregenNode ?? null);
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
                const pn = NODES.find((p) => p.id === n.id);
                return pn ? KIND_COLORS[pn.kind] : "#666";
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
        {(Object.entries(KIND_COLORS) as [NodeKind, string][]).map(
          ([kind, color]) => (
            <div key={kind} className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full" style={{ background: color }} />
              <span className="text-[10px] text-white/40">{kind}</span>
            </div>
          ),
        )}
        <div className="ml-4 flex items-center gap-3 border-l border-white/10 pl-4">
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
                  background: style.stroke,
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

export default function PregenSitesPage() {
  return (
    <ReactFlowProvider>
      <PregenSitesInner />
    </ReactFlowProvider>
  );
}
