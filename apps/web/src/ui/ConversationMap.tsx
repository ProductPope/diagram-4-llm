import type { ConversationGraph, NodeId, TurnNode } from "@diagram-4-llm/core";
import {
  Controls,
  Handle,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect } from "react";

import { layoutForest, NODE_HEIGHT, NODE_WIDTH } from "../app/layout";

interface TurnData extends Record<string, unknown> {
  readonly turn: TurnNode;
  readonly onBranch: boolean;
  readonly isTip: boolean;
  readonly onSelect: (id: NodeId) => void;
}

type TurnFlowNode = Node<TurnData, "turn">;

interface Props {
  readonly graph: ConversationGraph;
  readonly branch: readonly TurnNode[];
  readonly onSelect: (id: NodeId) => void;
}

const nodeTypes = { turn: TurnNodeView };

/**
 * The whole conversation as a tree. The selected branch is highlighted, and
 * activating a node shows its branch in the reading pane. Nodes show a short
 * label only; the reading pane is where messages are read.
 */
export function ConversationMap({ graph, branch, onSelect }: Props) {
  const onBranch = new Set(branch.map((turn) => turn.id));
  const tipId = branch.at(-1)?.id;
  const children = new Map<string | null, string[]>();
  const edges: Edge[] = [];

  for (const node of graph.nodes.values()) {
    if (node.kind === "summary") continue;
    children.set(node.parentId, [
      ...(children.get(node.parentId) ?? []),
      node.id,
    ]);
    if (node.parentId !== null) {
      edges.push({
        id: `parent:${node.id}`,
        source: node.parentId,
        target: node.id,
        className: onBranch.has(node.id) ? "edge-branch" : "edge",
      });
    }
    if (node.kind === "user") {
      for (const ref of node.refs) {
        edges.push({
          id: `ref:${ref}:${node.id}`,
          source: ref,
          target: node.id,
          className: "edge-ref",
        });
      }
    }
  }

  const positions = layoutForest(children);
  const nodes: TurnFlowNode[] = [];
  for (const node of graph.nodes.values()) {
    const position = positions.get(node.id);
    if (node.kind === "summary" || position === undefined) continue;
    nodes.push({
      id: node.id,
      type: "turn",
      position,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      data: {
        turn: node,
        onBranch: onBranch.has(node.id),
        isTip: node.id === tipId,
        onSelect,
      },
    });
  }

  return (
    <section className="map" aria-label="Conversation map">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        fitView
        minZoom={0.1}
      >
        <Controls showInteractive={false} />
        <FitWhenNodesChange count={nodes.length} />
      </ReactFlow>
    </section>
  );
}

/** Keeps new turns in view: the map refits whenever the number of nodes changes. */
function FitWhenNodesChange({ count }: { readonly count: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    void fitView({ duration: 200 });
  }, [count, fitView]);
  return null;
}

function TurnNodeView({ data }: NodeProps<TurnFlowNode>) {
  const { turn, onBranch, isTip, onSelect } = data;
  const classes = [
    "map-node",
    `map-node-${turn.kind}`,
    onBranch ? "map-node-branch" : "",
    turn.kind === "assistant" ? `map-node-${turn.status}` : "",
  ];
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <button
        type="button"
        className={classes.filter((c) => c !== "").join(" ")}
        aria-current={isTip ? "true" : undefined}
        title={turn.content}
        onClick={() => {
          onSelect(turn.id);
        }}
      >
        <span className="map-node-role">
          {turn.kind === "user" ? "You" : turn.generation.model}
        </span>
        <span className="map-node-label">{labelOf(turn)}</span>
      </button>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </>
  );
}

function labelOf(turn: TurnNode): string {
  const text = turn.content.trim().replace(/\s+/g, " ");
  if (text === "")
    return turn.kind === "assistant" && turn.status === "streaming"
      ? "…"
      : "(empty)";
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}
