import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

/**
 * Position nodes with dagre (same approach as the /flow/* system maps, which
 * each carry a private copy — new flow surfaces should import this one).
 */
export function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  options: {
    direction?: "LR" | "TB";
    nodeWidth: number;
    nodeHeight: number;
    ranksep?: number;
    nodesep?: number;
  },
): Node[] {
  const {
    direction = "TB",
    nodeWidth,
    nodeHeight,
    ranksep = 70,
    nodesep = 40,
  } = options;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep, nodesep });

  nodes.forEach((n) =>
    g.setNode(n.id, { width: nodeWidth, height: nodeHeight }),
  );
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id) as { x: number; y: number };
    return {
      ...n,
      position: { x: pos.x - nodeWidth / 2, y: pos.y - nodeHeight / 2 },
    };
  });
}
