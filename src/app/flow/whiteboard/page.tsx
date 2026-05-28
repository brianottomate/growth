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
  PLATFORM_NODES,
  PLATFORM_COLORS,
  KIND_COLORS,
  LENS_META,
  getNodesForLens,
  getEdgesForLens,
  type PlatformLens,
  type PlatformNode,
} from "@/data/wander-platform";

// ─── Layout ──────────────────────────────────────────────

const NODE_WIDTH = 180;
const NODE_HEIGHT = 52;

type DagrePosition = { x: number; y: number };

function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: "LR" | "TB" = "TB",
): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep: 100, nodesep: 50 });

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

// ─── Custom nodes ────────────────────────────────────────

function PlatformNodeComponent({ data }: NodeProps) {
  const d = data as unknown as PlatformNode & {
    color: string;
    borderColor: string;
  };

  return (
    <div
      className="relative rounded-lg border-2 px-3 py-2 shadow-lg"
      style={{
        background: `${d.color}18`,
        borderColor: d.borderColor,
        minWidth: NODE_WIDTH,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: d.borderColor, width: 6, height: 6 }}
      />
      <div className="flex items-center gap-2">
        <div
          className="h-3 w-3 shrink-0 rounded-sm"
          style={{ background: d.color }}
        />
        <div className="min-w-0">
          <div className="truncate text-xs font-bold text-white">{d.label}</div>
          {d.description && (
            <div className="truncate text-[10px] text-white/50">
              {d.description}
            </div>
          )}
        </div>
      </div>
      {d.tech && (
        <div className="mt-1 truncate text-[9px] font-medium text-white/30">
          {d.tech}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: d.borderColor, width: 6, height: 6 }}
      />
    </div>
  );
}

function GroupNodeComponent({ data }: NodeProps) {
  const d = data as unknown as PlatformNode & { color: string };

  return (
    <div
      className="rounded-md border border-white/10 px-3 py-2"
      style={{ background: `${d.color}10`, minWidth: 140 }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "rgba(255,255,255,0.2)", width: 6, height: 6 }}
      />
      <div className="text-[10px] font-semibold tracking-wider text-white/40 uppercase">
        {d.label}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "rgba(255,255,255,0.2)", width: 6, height: 6 }}
      />
    </div>
  );
}

function PackageNodeComponent({ data }: NodeProps) {
  const d = data as unknown as PlatformNode & { color: string };

  return (
    <div
      className="rounded border border-white/15 px-2.5 py-1.5 shadow"
      style={{ background: `${d.color}12`, minWidth: 120 }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "rgba(255,255,255,0.15)", width: 5, height: 5 }}
      />
      <div className="text-[11px] font-medium text-white/70">{d.label}</div>
      {d.description && (
        <div className="truncate text-[9px] text-white/35">{d.description}</div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "rgba(255,255,255,0.15)", width: 5, height: 5 }}
      />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  platform: PlatformNodeComponent,
  group: GroupNodeComponent,
  package: PackageNodeComponent,
};

// ─── Edge styling ────────────────────────────────────────

const EDGE_STYLES: Record<
  string,
  { stroke: string; strokeDasharray?: string; animated?: boolean }
> = {
  calls: { stroke: "#60a5fa", animated: true },
  contains: { stroke: "#475569", strokeDasharray: "4 3" },
  depends: { stroke: "#f97316", strokeDasharray: "6 3" },
  deploys: { stroke: "#10b981" },
  shares: { stroke: "#a78bfa", strokeDasharray: "2 2" },
};

// ─── Lens button ─────────────────────────────────────────

function LensButton({
  lens,
  active,
  onClick,
}: {
  lens: PlatformLens;
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
      {LENS_META[lens].label}
    </button>
  );
}

// ─── Detail panel ────────────────────────────────────────

function DetailPanel({
  node,
  onClose,
}: {
  node: PlatformNode;
  onClose: () => void;
}) {
  const color = node.platform
    ? PLATFORM_COLORS[node.platform]
    : KIND_COLORS[node.kind];

  return (
    <div className="w-72 shrink-0 overflow-y-auto border-l border-white/10 bg-gray-900 p-5">
      <div className="mb-4 flex items-start justify-between">
        <div
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
          style={{ background: `${color}22`, color }}
        >
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: color }}
          />
          {node.kind}
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/70">
          ✕
        </button>
      </div>

      <h2 className="mb-1 text-base font-semibold text-white">{node.label}</h2>
      {node.description && (
        <p className="mb-4 text-sm text-white/60">{node.description}</p>
      )}

      {node.tech && (
        <div className="mb-3">
          <div className="mb-1 text-[10px] font-semibold tracking-wider text-white/30 uppercase">
            Tech
          </div>
          <div className="text-sm text-white/80">{node.tech}</div>
        </div>
      )}

      {node.platform && (
        <div className="mb-3">
          <div className="mb-1 text-[10px] font-semibold tracking-wider text-white/30 uppercase">
            Platform
          </div>
          <div
            className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs"
            style={{
              background: `${PLATFORM_COLORS[node.platform]}22`,
              color: PLATFORM_COLORS[node.platform],
            }}
          >
            {node.platform}
          </div>
        </div>
      )}

      {node.repo && (
        <div className="mb-3">
          <div className="mb-1 text-[10px] font-semibold tracking-wider text-white/30 uppercase">
            Repository
          </div>
          <div className="font-mono text-xs text-white/70">{node.repo}</div>
        </div>
      )}
    </div>
  );
}

// ─── Main graph ──────────────────────────────────────────

function WhiteboardInner() {
  const [activeLens, setActiveLens] = useState<PlatformLens>("full");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<PlatformNode | null>(null);

  const buildGraph = useCallback(
    (lens: PlatformLens) => {
      const platformNodes = getNodesForLens(lens);
      const platformEdges = getEdgesForLens(lens);

      const rfNodes: Node[] = platformNodes.map((n) => {
        const color = n.platform
          ? PLATFORM_COLORS[n.platform]
          : KIND_COLORS[n.kind];

        const nodeType =
          n.kind === "platform" || n.kind === "repo"
            ? "platform"
            : n.kind === "group"
              ? "group"
              : "package";

        return {
          id: n.id,
          type: nodeType,
          position: { x: 0, y: 0 },
          data: { ...n, color, borderColor: color },
        };
      });

      const rfEdges: Edge[] = platformEdges.map((e) => {
        const fallback = {
          stroke: "#60a5fa",
          strokeDasharray: undefined,
          animated: true,
        };
        const style = EDGE_STYLES[e.type] ?? fallback;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
          labelStyle: { fontSize: 9, fill: "rgba(255,255,255,0.45)" },
          labelBgStyle: { fill: "rgba(15,15,20,0.8)" },
          style: {
            stroke: style.stroke ?? "#60a5fa",
            strokeWidth: e.type === "contains" ? 1 : 1.5,
            strokeDasharray: style.strokeDasharray ?? undefined,
          },
          animated: style.animated ?? false,
          markerEnd:
            e.type !== "contains"
              ? {
                  type: MarkerType.ArrowClosed,
                  width: 10,
                  height: 10,
                  color: style.stroke ?? "#60a5fa",
                }
              : undefined,
        };
      });

      const direction = lens === "monorepo" ? "TB" : "TB";
      const laid = applyDagreLayout(rfNodes, rfEdges, direction);
      setNodes(laid);
      setEdges(rfEdges);
      setSelectedNode(null);
    },
    [setNodes, setEdges],
  );

  useEffect(() => {
    buildGraph(activeLens);
  }, [activeLens, buildGraph]);

  const lenses: PlatformLens[] = [
    "full",
    "surfaces",
    "monorepo",
    "growth-stack",
  ];

  return (
    <div className="flex h-full flex-col bg-gray-950">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-white/10 px-6 py-4">
        <div>
          <h1 className="text-sm font-semibold text-white">
            Wander Platform Architecture
          </h1>
          <p className="mt-0.5 text-xs text-white/40">
            {LENS_META[activeLens].description}
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
              const platformNode = PLATFORM_NODES.find((n) => n.id === node.id);
              setSelectedNode(platformNode ?? null);
            }}
            fitView
            fitViewOptions={{ padding: 0.2 }}
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
                const pn = PLATFORM_NODES.find((p) => p.id === n.id);
                if (!pn) return "#666";
                return pn.platform
                  ? PLATFORM_COLORS[pn.platform]
                  : KIND_COLORS[pn.kind];
              }}
              maskColor="rgba(0,0,0,0.6)"
            />
          </ReactFlow>
        </div>

        {selectedNode && (
          <DetailPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 px-6 py-2">
        {Object.entries(PLATFORM_COLORS).map(([platform, color]) => (
          <div key={platform} className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-full"
              style={{ background: color }}
            />
            <span className="text-[10px] text-white/40">{platform}</span>
          </div>
        ))}
        <div className="ml-4 flex items-center gap-3 border-l border-white/10 pl-4">
          <div className="flex items-center gap-1.5">
            <div className="h-px w-5 bg-blue-400" />
            <span className="text-[10px] text-white/40">API calls</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-px w-5 border-t border-dashed border-slate-500" />
            <span className="text-[10px] text-white/40">contains</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="h-px w-5 bg-orange-400"
              style={{ borderTop: "2px dashed #f97316" }}
            />
            <span className="text-[10px] text-white/40">depends</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-px w-5 border-t border-dashed border-violet-400" />
            <span className="text-[10px] text-white/40">shares</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WhiteboardPage() {
  return (
    <ReactFlowProvider>
      <WhiteboardInner />
    </ReactFlowProvider>
  );
}
