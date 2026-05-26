"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Panel,
} from "@xyflow/react";
import type { ELK, ElkNode, ElkExtendedEdge } from "elkjs/lib/elk-api";
import "@xyflow/react/dist/style.css";

import {
  NODES,
  EDGES,
  GROUP_MAP,
  CATEGORY_COLORS,
  EDGE_COLORS,
  LENS_META,
  SYSTEM_ISSUES,
  TRACKING_STATS,
  getNodesForLens,
  getEdgesForLens,
  type Lens,
  type EcoNode,
  type EcoEdge,
  type GroupId,
  type SystemIssue,
} from "@/data/wander-ecosystem";

// ─── Constants ────────────────────────────────────────────

const NODE_WIDTH = 170;
const NODE_HEIGHT = 50;
const GROUP_PADDING = 20;

// ─── ELK Layout ───────────────────────────────────────────

// Lazy-load ELK (1.6MB bundle) only when needed
let elkInstance: ELK | null = null;
async function getElk() {
  if (!elkInstance) {
    const ELK = (await import("elkjs/lib/elk.bundled.js")).default;
    elkInstance = new ELK();
  }
  return elkInstance;
}

async function computeElkLayout(
  allNodes: EcoNode[],
  allEdges: EcoEdge[],
  lens: Lens,
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const visibleNodes = lens === "full" ? allNodes : getNodesForLens(lens);
  const visibleEdges = lens === "full" ? allEdges : getEdgesForLens(lens);
  const nodeIds = new Set(visibleNodes.map((n) => n.id));

  // Group visible nodes by group
  const grouped = new Map<GroupId, EcoNode[]>();
  for (const n of visibleNodes) {
    const list = grouped.get(n.group) ?? [];
    list.push(n);
    grouped.set(n.group, list);
  }

  // Build ELK compound graph: root → group nodes → child nodes
  const elkChildren: ElkNode[] = [];
  for (const [groupId, groupNodes] of grouped) {
    elkChildren.push({
      id: `group-${groupId}`,
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.spacing.nodeNode": "20",
        "elk.padding": `[top=${GROUP_PADDING + 30},left=${GROUP_PADDING},bottom=${GROUP_PADDING},right=${GROUP_PADDING}]`,
        "elk.layered.spacing.nodeNodeBetweenLayers": "25",
      },
      children: groupNodes.map((n) => ({
        id: n.id,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      })),
    });
  }

  // Filter edges to visible nodes, separate inter-group and intra-group
  const elkEdges: ElkExtendedEdge[] = [];
  for (const e of visibleEdges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    elkEdges.push({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    });
  }

  const elkGraph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: elkChildren,
    edges: elkEdges,
  };

  const elkEngine = await getElk();
  const layoutResult = await elkEngine.layout(elkGraph);

  // Map ELK results back to React Flow nodes
  const rfNodes: Node[] = [];

  for (const elkGroup of layoutResult.children ?? []) {
    const groupId = elkGroup.id.replace("group-", "") as GroupId;
    const group = GROUP_MAP[groupId];

    rfNodes.push({
      id: elkGroup.id,
      type: "group",
      position: { x: elkGroup.x ?? 0, y: elkGroup.y ?? 0 },
      data: { label: group.label },
      style: {
        width: elkGroup.width,
        height: elkGroup.height,
        background: `${group.color}08`,
        border: `1px solid ${group.color}30`,
        borderRadius: 12,
      },
    });

    for (const elkChild of elkGroup.children ?? []) {
      const ecoNode = visibleNodes.find((n) => n.id === elkChild.id);
      if (!ecoNode) continue;

      rfNodes.push({
        id: elkChild.id,
        type: "eco",
        parentId: elkGroup.id,
        extent: "parent" as const,
        position: { x: elkChild.x ?? 0, y: elkChild.y ?? 0 },
        data: { ...ecoNode, color: CATEGORY_COLORS[ecoNode.category], groupColor: group.color },
      });
    }
  }

  // Build React Flow edges with styling
  const rfEdges: Edge[] = [];
  for (const e of visibleEdges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    const color = EDGE_COLORS[e.kind] ?? "#6b7280";
    rfEdges.push({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: "smoothstep",
      labelStyle: { fontSize: 9, fill: "rgba(255,255,255,0.5)" },
      labelBgStyle: { fill: "rgba(15,15,20,0.8)", fillOpacity: 0.8 },
      labelBgPadding: [4, 2] as [number, number],
      style: {
        stroke: color,
        strokeWidth: 1.5,
        strokeDasharray: e.kind === "human" ? "4 3" : undefined,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 10,
        height: 10,
        color,
      },
      animated: e.animated,
    });
  }

  return { nodes: rfNodes, edges: rfEdges };
}

// ─── Custom Nodes ─────────────────────────────────────────

function EcoNodeComponent({ data }: NodeProps) {
  const d = data as unknown as EcoNode & { color: string; groupColor: string };
  const hasIssue = d.status === "issue";
  const isLegacy = d.status === "legacy";
  const isPlanned = d.status === "planned";

  return (
    <div
      className="relative rounded-lg border px-3 py-2 shadow-md transition-shadow hover:shadow-lg"
      style={{
        background: `${d.color}15`,
        borderColor: hasIssue ? "#f59e0b" : isLegacy ? "#64748b55" : `${d.color}40`,
        minWidth: NODE_WIDTH - 16,
        opacity: isLegacy ? 0.6 : 1,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: "transparent", border: "none" }} />
      <Handle type="target" position={Position.Left} id="left" style={{ background: "transparent", border: "none" }} />
      <div className="flex items-center gap-1.5">
        <div
          className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
          style={{ background: d.color }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-semibold leading-tight text-white">
            {d.label}
          </div>
          {d.description && (
            <div className="mt-0.5 truncate text-[9px] text-white/40" style={{ maxWidth: 140 }}>
              {d.description}
            </div>
          )}
        </div>
        {isLegacy && (
          <span className="shrink-0 rounded bg-gray-700/60 px-1 py-0.5 text-[8px] text-gray-400">LEGACY</span>
        )}
        {isPlanned && (
          <span className="shrink-0 rounded bg-blue-900/40 px-1 py-0.5 text-[8px] text-blue-300">PLANNED</span>
        )}
      </div>
      {(d.notes || hasIssue) && (
        <div
          title={d.notes ?? "Has issues"}
          className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full"
          style={{ background: hasIssue ? "#f59e0b" : "#6b7280" }}
        />
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: "transparent", border: "none" }} />
      <Handle type="source" position={Position.Right} id="right" style={{ background: "transparent", border: "none" }} />
    </div>
  );
}

function GroupNodeComponent({ data }: NodeProps) {
  const d = data as unknown as { label: string };
  return (
    <div className="h-full w-full">
      <div className="px-2 pt-2 text-[11px] font-bold uppercase tracking-wider text-white/50">
        {d.label}
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  eco: EcoNodeComponent,
  group: GroupNodeComponent,
};

// ─── Sidebar: Issues ──────────────────────────────────────

function IssueCard({ issue, onHover }: { issue: SystemIssue; onHover: (nodeIds: string[] | null) => void }) {
  const severityColors = {
    critical: { bg: "bg-red-900/30", border: "border-red-500/40", text: "text-red-300", badge: "bg-red-500/20 text-red-300" },
    warning: { bg: "bg-amber-900/30", border: "border-amber-500/40", text: "text-amber-300", badge: "bg-amber-500/20 text-amber-300" },
    info: { bg: "bg-blue-900/30", border: "border-blue-500/40", text: "text-blue-300", badge: "bg-blue-500/20 text-blue-300" },
  };
  const s = severityColors[issue.severity];

  return (
    <div
      className={`rounded-lg border p-3 ${s.bg} ${s.border} transition-colors`}
      onMouseEnter={() => onHover(issue.affectedNodes)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${s.badge}`}>
          {issue.severity}
        </span>
        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-white/40">
          {issue.category}
        </span>
      </div>
      <div className={`text-xs font-medium ${s.text}`}>{issue.title}</div>
      <div className="mt-1 text-[10px] leading-relaxed text-white/40">{issue.description}</div>
    </div>
  );
}

// ─── Sidebar: Stats ───────────────────────────────────────

function StatsPanel() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">Tracking Plan</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-white/5 p-2.5">
            <div className="text-lg font-bold text-white">{TRACKING_STATS.totalEvents}</div>
            <div className="text-[10px] text-white/40">Total Events</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2.5">
            <div className="text-lg font-bold text-white">{TRACKING_STATS.segmentSources}</div>
            <div className="text-[10px] text-white/40">Segment Sources</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2.5">
            <div className="text-lg font-bold text-amber-400">{TRACKING_STATS.crossSurfaceEvents}</div>
            <div className="text-[10px] text-white/40">Cross-Surface</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2.5">
            <div className="text-lg font-bold text-white">{TRACKING_STATS.funnels.length}</div>
            <div className="text-[10px] text-white/40">Funnels Defined</div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">Events by Surface</h3>
        <div className="space-y-1.5">
          {TRACKING_STATS.surfaces.map((s) => (
            <div key={s.name} className="flex items-center justify-between rounded bg-white/5 px-2.5 py-1.5">
              <div>
                <div className="text-[11px] font-medium text-white">{s.name}</div>
                <div className="text-[9px] text-white/30">{s.workspace}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-white">{s.eventCount}</div>
                <div className="text-[9px] text-white/30">{s.type}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">Funnels</h3>
        <div className="space-y-1">
          {TRACKING_STATS.funnels.map((f) => (
            <div key={f.name} className="flex items-center justify-between rounded bg-white/5 px-2.5 py-1.5">
              <span className="text-[10px] text-white/70">{f.name}</span>
              <span className="text-[9px] text-white/30">{f.steps} steps</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Node Detail Panel ────────────────────────────────────

function NodeDetail({ node, onClose }: { node: EcoNode; onClose: () => void }) {
  const group = GROUP_MAP[node.group];
  const color = CATEGORY_COLORS[node.category];
  const relatedIssues = SYSTEM_ISSUES.filter((i) => i.affectedNodes.includes(node.id));
  const incomingEdges = EDGES.filter((e) => e.target === node.id);
  const outgoingEdges = EDGES.filter((e) => e.source === node.id);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
          style={{ background: `${color}22`, color }}
        >
          <div className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
          {node.category}
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/70 text-sm">x</button>
      </div>

      <div>
        <h2 className="text-base font-semibold text-white">{node.label}</h2>
        {node.description && <p className="mt-1 text-sm text-white/60">{node.description}</p>}
      </div>

      {node.owner && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">Owner</div>
          <div className="text-sm text-white/80">{node.owner}</div>
        </div>
      )}

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">Group</div>
        <div className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs" style={{ background: `${group.color}20`, color: group.color }}>
          {group.label}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">Lenses</div>
        <div className="flex flex-wrap gap-1">
          {node.lenses.map((l) => (
            <span key={l} className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">
              {LENS_META[l].label}
            </span>
          ))}
        </div>
      </div>

      {(incomingEdges.length > 0 || outgoingEdges.length > 0) && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">Connections</div>
          {incomingEdges.length > 0 && (
            <div className="mb-2">
              <div className="mb-1 text-[9px] text-white/20">INCOMING</div>
              {incomingEdges.map((e) => {
                const sourceNode = NODES.find((n) => n.id === e.source);
                return (
                  <div key={e.id} className="flex items-center gap-1.5 py-0.5 text-[10px]">
                    <span className="h-1 w-1 rounded-full" style={{ background: EDGE_COLORS[e.kind] }} />
                    <span className="text-white/50">{sourceNode?.label ?? e.source}</span>
                    {e.label && <span className="text-white/25">({e.label})</span>}
                  </div>
                );
              })}
            </div>
          )}
          {outgoingEdges.length > 0 && (
            <div>
              <div className="mb-1 text-[9px] text-white/20">OUTGOING</div>
              {outgoingEdges.map((e) => {
                const targetNode = NODES.find((n) => n.id === e.target);
                return (
                  <div key={e.id} className="flex items-center gap-1.5 py-0.5 text-[10px]">
                    <span className="h-1 w-1 rounded-full" style={{ background: EDGE_COLORS[e.kind] }} />
                    <span className="text-white/50">{targetNode?.label ?? e.target}</span>
                    {e.label && <span className="text-white/25">({e.label})</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {node.url && (
        <a href={node.url} target="_blank" rel="noreferrer" className="block text-xs text-blue-400 hover:underline">
          {node.url}
        </a>
      )}

      {node.notes && (
        <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-300">
          {node.notes}
        </div>
      )}

      {relatedIssues.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">Related Issues</div>
          <div className="space-y-2">
            {relatedIssues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} onHover={() => undefined} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Lens Switcher ────────────────────────────────────────

function LensBar({
  active,
  onChange,
}: {
  active: Lens;
  onChange: (lens: Lens) => void;
}) {
  const lenses: Lens[] = ["full", "data-spine", "guest-journey", "sales-motion", "attribution", "host-journey", "content-flow"];
  return (
    <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
      {lenses.map((lens) => (
        <button
          key={lens}
          onClick={() => onChange(lens)}
          className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-all ${
            active === lens
              ? "bg-white text-gray-900 shadow"
              : "text-white/50 hover:bg-white/10 hover:text-white/80"
          }`}
        >
          {LENS_META[lens].label}
        </button>
      ))}
    </div>
  );
}

// ─── Sidebar Tab ──────────────────────────────────────────

type SidebarTab = "issues" | "stats" | "detail";

function SidebarTabButton({ tab, active, label, count, onClick }: {
  tab: SidebarTab;
  active: SidebarTab;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium transition-all ${
        active === tab ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`rounded-full px-1.5 py-0.5 text-[8px] ${
          active === tab ? "bg-white/20" : "bg-white/5"
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────

function CommandCenterInner() {
  const [activeLens, setActiveLens] = useState<Lens>("full");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<EcoNode | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("issues");
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string> | null>(null);

  const buildGraph = useCallback(
    async (lens: Lens) => {
      const { nodes: rfNodes, edges: rfEdges } = await computeElkLayout(NODES, EDGES, lens);
      setNodes(rfNodes);
      setEdges(rfEdges);
    },
    [setNodes, setEdges],
  );

  useEffect(() => {
    void buildGraph(activeLens);
    setSelectedNode(null);
  }, [activeLens, buildGraph]);

  // Issue counts by severity
  const issueCounts = useMemo(() => ({
    critical: SYSTEM_ISSUES.filter((i) => i.severity === "critical").length,
    warning: SYSTEM_ISSUES.filter((i) => i.severity === "warning").length,
    info: SYSTEM_ISSUES.filter((i) => i.severity === "info").length,
    total: SYSTEM_ISSUES.length,
  }), []);

  const handleIssueHover = useCallback(
    (nodeIds: string[] | null) => {
      setHighlightedNodes(nodeIds ? new Set(nodeIds) : null);
    },
    [],
  );

  // Apply highlighting
  const displayNodes = useMemo(() => {
    if (!highlightedNodes) return nodes;
    return nodes.map((n) => {
      if (n.type === "group") return n;
      const isHighlighted = highlightedNodes.has(n.id);
      return {
        ...n,
        style: {
          ...((n.style) ?? {}),
          opacity: isHighlighted ? 1 : 0.2,
          transition: "opacity 0.2s",
        },
      };
    });
  }, [nodes, highlightedNodes]);

  return (
    <div className="flex h-full flex-col bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-sm font-semibold text-white">Wander Command Center</h1>
            <p className="text-[10px] text-white/30">{LENS_META[activeLens].description}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 rounded bg-red-900/30 px-2 py-0.5 text-[10px] text-red-300">
              {issueCounts.critical} critical
            </span>
            <span className="flex items-center gap-1 rounded bg-amber-900/30 px-2 py-0.5 text-[10px] text-amber-300">
              {issueCounts.warning} warnings
            </span>
          </div>
        </div>
        <LensBar active={activeLens} onChange={setActiveLens} />
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Graph */}
        <div className="flex-1">
          <ReactFlow
            nodes={displayNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            onNodeClick={(_event, node) => {
              if (node.type === "group") return;
              const ecoNode = NODES.find((n) => n.id === node.id);
              if (ecoNode) {
                setSelectedNode(ecoNode);
                setSidebarTab("detail");
              }
            }}
            fitView
            fitViewOptions={{ padding: 0.1 }}
            minZoom={0.15}
            maxZoom={2}
            colorMode="dark"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.04)" />
            <Controls />
            <MiniMap
              nodeColor={(n) => {
                if (n.type === "group") {
                  const groupId = n.id.replace("group-", "") as GroupId;
                  return GROUP_MAP[groupId]?.color ?? "#333";
                }
                const ecoNode = NODES.find((en) => en.id === n.id);
                return ecoNode ? CATEGORY_COLORS[ecoNode.category] : "#666";
              }}
              maskColor="rgba(0,0,0,0.6)"
              style={{ background: "rgba(15,15,20,0.8)" }}
            />

            {/* Legend overlay */}
            <Panel position="bottom-left">
              <div className="rounded-lg border border-white/10 bg-gray-900/90 p-3 backdrop-blur-sm">
                <div className="mb-2 text-[9px] font-bold uppercase tracking-wider text-white/30">Node Types</div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {(
                    [
                      ["surface", "Surface"],
                      ["hub", "Hub"],
                      ["destination", "Destination"],
                      ["tool", "Tool"],
                      ["team", "Team"],
                      ["external", "External"],
                      ["storage", "Storage"],
                      ["service", "Service"],
                      ["page", "Page"],
                      ["integration", "Integration"],
                    ] as const
                  ).map(([type, label]) => (
                    <div key={type} className="flex items-center gap-1">
                      <div className="h-1.5 w-1.5 rounded-full" style={{ background: CATEGORY_COLORS[type] }} />
                      <span className="text-[9px] text-white/35">{label}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-3 border-t border-white/5 pt-2">
                  {(
                    [
                      ["events", "Events", false],
                      ["webhook", "Webhook", false],
                      ["api", "API", false],
                      ["human", "Human", true],
                      ["traffic", "Traffic", false],
                      ["content", "Content", false],
                      ["data", "Data", false],
                    ] as const
                  ).map(([kind, label, dashed]) => (
                    <div key={kind} className="flex items-center gap-1">
                      <div
                        className="h-px w-4"
                        style={{
                          background: EDGE_COLORS[kind],
                          borderTop: dashed ? `1px dashed ${EDGE_COLORS[kind]}` : undefined,
                        }}
                      />
                      <span className="text-[9px] text-white/35">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* Sidebar */}
        <div className="flex w-80 shrink-0 flex-col border-l border-white/10 bg-gray-900">
          {/* Sidebar tabs */}
          <div className="flex gap-1 border-b border-white/10 p-2">
            <SidebarTabButton
              tab="issues"
              active={sidebarTab}
              label="Issues"
              count={issueCounts.total}
              onClick={() => setSidebarTab("issues")}
            />
            <SidebarTabButton
              tab="stats"
              active={sidebarTab}
              label="Tracking Stats"
              onClick={() => setSidebarTab("stats")}
            />
            {selectedNode && (
              <SidebarTabButton
                tab="detail"
                active={sidebarTab}
                label={selectedNode.label}
                onClick={() => setSidebarTab("detail")}
              />
            )}
          </div>

          {/* Sidebar content */}
          <div className="flex-1 overflow-y-auto p-3">
            {sidebarTab === "issues" && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                  Critical ({issueCounts.critical})
                </div>
                {SYSTEM_ISSUES.filter((i) => i.severity === "critical").map((issue) => (
                  <IssueCard key={issue.id} issue={issue} onHover={handleIssueHover} />
                ))}
                <div className="mt-3 text-[10px] font-bold uppercase tracking-wider text-white/30">
                  Warnings ({issueCounts.warning})
                </div>
                {SYSTEM_ISSUES.filter((i) => i.severity === "warning").map((issue) => (
                  <IssueCard key={issue.id} issue={issue} onHover={handleIssueHover} />
                ))}
                <div className="mt-3 text-[10px] font-bold uppercase tracking-wider text-white/30">
                  Info ({issueCounts.info})
                </div>
                {SYSTEM_ISSUES.filter((i) => i.severity === "info").map((issue) => (
                  <IssueCard key={issue.id} issue={issue} onHover={handleIssueHover} />
                ))}
              </div>
            )}
            {sidebarTab === "stats" && <StatsPanel />}
            {sidebarTab === "detail" && selectedNode && (
              <NodeDetail
                node={selectedNode}
                onClose={() => {
                  setSelectedNode(null);
                  setSidebarTab("issues");
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CommandCenter() {
  return (
    <ReactFlowProvider>
      <CommandCenterInner />
    </ReactFlowProvider>
  );
}
