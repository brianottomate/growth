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
  getNodesForLens,
  getEdgesForLens,
  LENS_LABELS,
  LENS_DESCRIPTIONS,
  NODE_COLORS,
  type Lens,
  type WanderNode,
} from "@/data/wander-system";

// ─── Layout ───────────────────────────────────────────────

const NODE_WIDTH = 160;
const NODE_HEIGHT = 44;

type DagrePosition = { x: number; y: number };

function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: "LR" | "TB" = "LR",
): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep: 80, nodesep: 40 });

  nodes.forEach((n) =>
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }),
  );
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id) as DagrePosition;
    return {
      ...n,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });
}

// ─── Custom node ──────────────────────────────────────────

function WanderNodeComponent({ data }: NodeProps) {
  // React Flow types data as Record<string,unknown> — cast through unknown
  const nodeData = data as unknown as WanderNode & { color: string };
  return (
    <div
      className="relative rounded-lg border px-3 py-2 shadow-md"
      style={{
        background: `${nodeData.color}22`,
        borderColor: `${nodeData.color}55`,
        minWidth: NODE_WIDTH,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "rgba(255,255,255,0.2)" }}
      />
      <div className="flex items-center gap-2">
        <div
          className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
          style={{ background: nodeData.color }}
        />
        <div>
          <div className="text-xs leading-tight font-semibold text-white">
            {nodeData.label}
          </div>
          {nodeData.description && (
            <div
              className="mt-0.5 text-[10px] text-white/50"
              style={{
                maxWidth: 140,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {nodeData.description}
            </div>
          )}
        </div>
      </div>
      {nodeData.notes && (
        <div
          title={nodeData.notes}
          className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-amber-400"
        />
      )}
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "rgba(255,255,255,0.2)" }}
      />
    </div>
  );
}

const nodeTypes: NodeTypes = { wander: WanderNodeComponent };

// ─── Lens button ──────────────────────────────────────────

function LensButton({
  lens,
  active,
  onClick,
}: {
  lens: Lens;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
        active
          ? "bg-white text-gray-900 shadow"
          : "text-white/60 hover:bg-white/10 hover:text-white/90"
      }`}
    >
      {LENS_LABELS[lens]}
    </button>
  );
}

// ─── Inner graph (needs ReactFlowProvider above) ───────────

function SystemMapInner() {
  const [activeLens, setActiveLens] = useState<Lens>("data-spine");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<WanderNode | null>(null);

  const buildGraph = useCallback(
    (lens: Lens) => {
      const wanderNodes = lens === "full" ? NODES : getNodesForLens(lens);
      const wanderEdges = lens === "full" ? EDGES : getEdgesForLens(lens);

      const rfNodes: Node[] = wanderNodes.map((n) => ({
        id: n.id,
        type: "wander",
        position: { x: 0, y: 0 },
        data: { ...n, color: NODE_COLORS[n.type] },
      }));

      const rfEdges: Edge[] = wanderEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        labelStyle: { fontSize: 9, fill: "rgba(255,255,255,0.5)" },
        labelBgStyle: { fill: "rgba(15,15,20,0.7)" },
        style: {
          stroke:
            e.type === "events"
              ? "#60a5fa"
              : e.type === "webhook"
                ? "#a78bfa"
                : e.type === "human"
                  ? "#94a3b8"
                  : e.type === "content"
                    ? "#2dd4bf"
                    : "#6b7280",
          strokeWidth: 1.5,
          strokeDasharray: e.type === "human" ? "4 3" : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color:
            e.type === "events"
              ? "#60a5fa"
              : e.type === "webhook"
                ? "#a78bfa"
                : "#94a3b8",
        },
        animated: e.type === "events",
      }));

      const laid = applyDagreLayout(
        rfNodes,
        rfEdges,
        lens === "full" ? "TB" : "LR",
      );
      setNodes(laid);
      setEdges(rfEdges);
      setSelectedNode(null);
    },
    [setNodes, setEdges],
  );

  useEffect(() => {
    buildGraph(activeLens);
  }, [activeLens, buildGraph]);

  const lenses: Lens[] = [
    "full",
    "data-spine",
    "guest-journey",
    "sales-motion",
    "attribution",
  ];

  return (
    <div className="flex h-full flex-col bg-gray-950">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-white/10 px-6 py-4">
        <div>
          <h1 className="text-sm font-semibold text-white">
            Wander System Map
          </h1>
          <p className="mt-0.5 text-xs text-white/40">
            {LENS_DESCRIPTIONS[activeLens]}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
          {lenses.map((lens) => (
            <LensButton
              key={lens}
              lens={lens}
              active={activeLens === lens}
              onClick={() => setActiveLens(lens)}
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
              const wanderNode = NODES.find((n) => n.id === node.id);
              setSelectedNode(wanderNode ?? null);
            }}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.3}
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
                const wanderNode = NODES.find((wn) => wn.id === n.id);
                return wanderNode ? NODE_COLORS[wanderNode.type] : "#666";
              }}
              maskColor="rgba(0,0,0,0.6)"
            />
          </ReactFlow>
        </div>

        {/* Node detail panel */}
        {selectedNode && (
          <div className="w-72 shrink-0 overflow-y-auto border-l border-white/10 bg-gray-900 p-5">
            <div className="mb-4 flex items-start justify-between">
              <div
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
                style={{
                  background: `${NODE_COLORS[selectedNode.type]}22`,
                  color: NODE_COLORS[selectedNode.type],
                }}
              >
                <div
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: NODE_COLORS[selectedNode.type] }}
                />
                {selectedNode.type}
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-white/30 hover:text-white/70"
              >
                ✕
              </button>
            </div>

            <h2 className="mb-1 text-base font-semibold text-white">
              {selectedNode.label}
            </h2>
            {selectedNode.description && (
              <p className="mb-4 text-sm text-white/60">
                {selectedNode.description}
              </p>
            )}

            {selectedNode.owner && (
              <div className="mb-3">
                <div className="mb-1 text-[10px] font-semibold tracking-wider text-white/30 uppercase">
                  Owner
                </div>
                <div className="text-sm text-white/80">
                  {selectedNode.owner}
                </div>
              </div>
            )}

            <div className="mb-3">
              <div className="mb-1 text-[10px] font-semibold tracking-wider text-white/30 uppercase">
                Appears in lenses
              </div>
              <div className="flex flex-wrap gap-1">
                {selectedNode.lenses.map((l) => (
                  <span
                    key={l}
                    className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60"
                  >
                    {LENS_LABELS[l]}
                  </span>
                ))}
              </div>
            </div>

            {selectedNode.url && (
              <a
                href={selectedNode.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block text-xs text-blue-400 hover:underline"
              >
                {selectedNode.url}
              </a>
            )}

            {selectedNode.notes && (
              <div className="mt-4 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-300">
                {selectedNode.notes}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 px-6 py-2">
        {(
          [
            ["surface", "Surface"],
            ["hub", "Hub"],
            ["destination", "Destination"],
            ["tool", "Tool"],
            ["team", "Team"],
            ["external", "External"],
            ["storage", "Storage"],
            ["cms", "CMS"],
          ] as const
        ).map(([type, label]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-full"
              style={{ background: NODE_COLORS[type] }}
            />
            <span className="text-[10px] text-white/40">{label}</span>
          </div>
        ))}
        <div className="ml-4 flex items-center gap-3 border-l border-white/10 pl-4">
          <div className="flex items-center gap-1.5">
            <div className="h-px w-5 bg-blue-400" />
            <span className="text-[10px] text-white/40">events</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-px w-5 border-t border-dashed border-slate-400" />
            <span className="text-[10px] text-white/40">human</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-px w-5 bg-violet-400" />
            <span className="text-[10px] text-white/40">webhook</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Exported wrapper (provides ReactFlow context) ────────

export function SystemMap() {
  return (
    <ReactFlowProvider>
      <SystemMapInner />
    </ReactFlowProvider>
  );
}
