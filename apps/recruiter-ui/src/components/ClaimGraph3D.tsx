import { useMemo } from "react";
import { graphBlueprintNodes } from "../data/mockApplications";
import type { GraphBlueprintNode } from "../data/mockApplications";

type NodeStatus = "idle" | "pending" | "verified" | "failed";

type PositionedNode = GraphBlueprintNode & {
  x: number;
  y: number;
};

type ClaimGraph3DProps = {
  activeNodeId: string;
  onSelectNode: (nodeId: string) => void;
  blueprintNodes?: GraphBlueprintNode[];
  nodeStatusById?: Record<string, NodeStatus>;
  celebrationMode?: boolean;
};

const VIEWBOX_W = 980;
const VIEWBOX_H = 780;
const CENTER_X = VIEWBOX_W / 2;
const CENTER_Y = VIEWBOX_H / 2;

function ringRadius(ring: number): number {
  if (ring <= 0) return 0;
  if (ring === 1) return 160;
  return 290;
}

function normalizeNodes(source: GraphBlueprintNode[]): PositionedNode[] {
  return source.map((node) => {
    const angle = (node.angle * Math.PI) / 180;
    const radius = ringRadius(node.ring);
    return {
      ...node,
      x: CENTER_X + Math.cos(angle) * radius,
      y: CENTER_Y + Math.sin(angle) * radius
    };
  });
}

function nodeClass(status: NodeStatus | undefined, active: boolean): string {
  if (active) return "graph-node active";
  if (status === "verified") return "graph-node verified";
  if (status === "pending") return "graph-node pending";
  if (status === "failed") return "graph-node failed";
  return "graph-node idle";
}

export function ClaimGraph3D({
  activeNodeId,
  onSelectNode,
  blueprintNodes,
  nodeStatusById,
  celebrationMode = false
}: ClaimGraph3DProps) {
  const sourceNodes = blueprintNodes && blueprintNodes.length ? blueprintNodes : graphBlueprintNodes;
  const nodes = useMemo(() => normalizeNodes(sourceNodes), [sourceNodes]);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const links = useMemo(
    () =>
      nodes
        .filter((node) => node.parentId)
        .map((node) => {
          const parent = byId.get(node.parentId!);
          if (!parent) {
            return null;
          }
          const fromStatus = nodeStatusById?.[parent.id];
          const toStatus = nodeStatusById?.[node.id];
          return {
            id: `${parent.id}->${node.id}`,
            from: parent,
            to: node,
            isVerified: fromStatus === "verified" && toStatus === "verified"
          };
        })
        .filter(Boolean) as { id: string; from: PositionedNode; to: PositionedNode; isVerified: boolean }[],
    [nodes, byId, nodeStatusById]
  );

  return (
    <div className="graph-force-wrap">
      <svg className="graph-svg" viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`} aria-label="Verification graph">
        <defs>
          <linearGradient id="linkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.48)" />
          </linearGradient>
          <linearGradient id="linkVerifiedGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(53, 255, 160, 0.1)" />
            <stop offset="45%" stopColor="rgba(80, 255, 176, 0.95)" />
            <stop offset="100%" stopColor="rgba(40, 180, 110, 0.2)" />
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              from="-1 0"
              to="1 0"
              dur="2.4s"
              repeatCount="indefinite"
            />
          </linearGradient>
          <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {links.map((link) => (
          <line
            key={link.id}
            className={[
              "graph-link",
              activeNodeId === link.from.id || activeNodeId === link.to.id ? "active" : "",
              link.isVerified ? "verified-path" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            x1={link.from.x}
            y1={link.from.y}
            x2={link.to.x}
            y2={link.to.y}
            stroke={link.isVerified ? "url(#linkVerifiedGrad)" : "url(#linkGrad)"}
          />
        ))}

        {nodes.map((node) => {
          const active = node.id === activeNodeId;
          const status = nodeStatusById?.[node.id];
          return (
            <g
              key={node.id}
              className={[nodeClass(status, active), celebrationMode ? "celebrating" : ""].filter(Boolean).join(" ")}
              transform={`translate(${node.x}, ${node.y})`}
              onClick={() => onSelectNode(node.id)}
            >
              <circle className="node-halo" r={node.ring === 0 ? 42 : 26} filter="url(#nodeGlow)" />
              <circle className="node-core" r={node.ring === 0 ? 18 : 10} />
              <text className="node-label" x={0} y={node.ring === 0 ? 58 : 38} textAnchor="middle">
                {node.label}
              </text>
              <title>{node.subLabel}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
