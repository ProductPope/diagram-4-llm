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
import { useEffect, useState } from "react";

import { visibleForest } from "../app/collapse";
import {
  layoutForest,
  NODE_HEIGHT,
  NODE_WIDTH,
  type Position as Point,
} from "../app/layout";
import { neighbour, type Direction } from "../app/navigation";

interface TurnData extends Record<string, unknown> {
  readonly turn: TurnNode;
  readonly onBranch: boolean;
  readonly isTip: boolean;
  /** A generated or user-given title, shown instead of the message start. */
  readonly title: string | undefined;
  /** The one node in the tab order; arrow keys move focus from it. */
  readonly isActive: boolean;
  /** Present only for nodes with children. */
  readonly fold?: { readonly hidden: number };
  readonly onSelect: (id: NodeId) => void;
  readonly onToggleCollapsed: (id: NodeId) => void;
  readonly onFocusTurn: (id: NodeId) => void;
  readonly onNavigate: (id: NodeId, direction: Direction) => void;
}

type TurnFlowNode = Node<TurnData, "turn">;

interface Props {
  readonly graph: ConversationGraph;
  readonly branch: readonly TurnNode[];
  readonly onSelect: (id: NodeId) => void;
  readonly onToggleCollapsed: (id: NodeId) => void;
}

const nodeTypes = { turn: TurnNodeView };

/**
 * The whole conversation as a tree. The selected branch is highlighted, and
 * activating a node shows its branch in the reading pane. Nodes show a short
 * label only; the reading pane is where messages are read. A collapsed node
 * hides its descendants and shows how many it hides.
 *
 * Only one node is in the tab order. Arrow keys move focus to the parent
 * (up), a reply (down) or another version (left, right), following the
 * layout; Enter shows the focused turn's branch.
 */
export function ConversationMap({
  graph,
  branch,
  onSelect,
  onToggleCollapsed,
}: Props) {
  const [focusId, setFocusId] = useState<NodeId | null>(null);
  const [keyboardMove, setKeyboardMove] = useState<{
    readonly id: NodeId;
    readonly position: Point;
  } | null>(null);
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

  const { visible, hiddenCounts } = visibleForest(
    children,
    (id) => graph.meta.get(id)?.collapsed === true,
  );
  const positions = layoutForest(visible);
  const activeId =
    focusId !== null && positions.has(focusId)
      ? focusId
      : branch.findLast((turn) => positions.has(turn.id))?.id;
  const onNavigate = (id: NodeId, direction: Direction) => {
    const target = neighbour(visible, id, direction, onBranch);
    const position = target === undefined ? undefined : positions.get(target);
    if (target === undefined || position === undefined) return;
    setFocusId(target);
    setKeyboardMove({ id: target, position });
  };
  const nodes: TurnFlowNode[] = [];
  for (const node of graph.nodes.values()) {
    const position = positions.get(node.id);
    if (node.kind === "summary" || position === undefined) continue;
    const hidden = hiddenCounts.get(node.id);
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
        title: graph.meta.get(node.id)?.title,
        isActive: node.id === activeId,
        ...(children.has(node.id) ? { fold: { hidden: hidden ?? 0 } } : {}),
        onSelect,
        onToggleCollapsed,
        onFocusTurn: setFocusId,
        onNavigate,
      },
    });
  }

  return (
    <section className="map" aria-label="Conversation map">
      <ReactFlow
        nodes={nodes}
        edges={edges.filter(
          (edge) => positions.has(edge.source) && positions.has(edge.target),
        )}
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
        <FollowBranch
          total={nodes.length}
          branchIds={branch
            .map((turn) => turn.id)
            .filter((id) => positions.has(id))}
        />
        <FocusAfterKeyboardMove move={keyboardMove} />
      </ReactFlow>
    </section>
  );
}

/** Up to this many turns the whole tree is shown at once. */
const FIT_ALL_LIMIT = 60;
/** In larger trees the view follows the last turns of the selected branch. */
const BRANCH_TAIL = 6;

/**
 * Keeps the relevant part of the conversation in view as it changes: the
 * whole tree while it is small enough to read at once, otherwise the end of
 * the selected branch, so the user always sees where the next message goes.
 */
function FollowBranch({
  total,
  branchIds,
}: {
  readonly total: number;
  readonly branchIds: readonly NodeId[];
}) {
  const { fitView } = useReactFlow();
  const tail = branchIds.slice(-BRANCH_TAIL).join(" ");
  useEffect(() => {
    const nodes =
      total <= FIT_ALL_LIMIT
        ? undefined
        : tail.split(" ").map((id) => ({ id }));
    void fitView({
      duration: 200,
      maxZoom: 1,
      ...(nodes === undefined ? {} : { nodes }),
    });
  }, [total, tail, fitView]);
  return null;
}

const KEY_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: "parent",
  ArrowDown: "child",
  ArrowLeft: "previous",
  ArrowRight: "next",
};

/**
 * Moves keyboard focus to the turn reached with an arrow key and centres
 * the view on it. The browser must not scroll to the focused element
 * itself: the map's viewport is a transform, not a scroll position.
 */
function FocusAfterKeyboardMove({
  move,
}: {
  readonly move: { readonly id: NodeId; readonly position: Point } | null;
}) {
  const { setCenter, getZoom } = useReactFlow();
  useEffect(() => {
    if (move === null) return;
    const element = document.querySelector<HTMLElement>(
      `.map [data-turn-id="${move.id}"]`,
    );
    element?.focus({ preventScroll: true });
    void setCenter(
      move.position.x + NODE_WIDTH / 2,
      move.position.y + NODE_HEIGHT / 2,
      { zoom: getZoom(), duration: 150 },
    );
  }, [move, setCenter, getZoom]);
  return null;
}

function TurnNodeView({ data }: NodeProps<TurnFlowNode>) {
  const {
    turn,
    onBranch,
    isTip,
    title,
    isActive,
    fold,
    onSelect,
    onToggleCollapsed,
    onFocusTurn,
    onNavigate,
  } = data;
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
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
        data-turn-id={turn.id}
        tabIndex={isActive ? 0 : -1}
        title={turn.content}
        onClick={() => {
          onSelect(turn.id);
        }}
        onFocus={() => {
          onFocusTurn(turn.id);
        }}
        onKeyDown={(event) => {
          const direction = KEY_DIRECTIONS[event.key];
          if (direction === undefined) return;
          event.preventDefault();
          onNavigate(turn.id, direction);
        }}
      >
        <span className="map-node-role">
          {turn.kind === "user" ? "You" : turn.generation.model}
        </span>
        <span className="map-node-label">{title ?? labelOf(turn)}</span>
      </button>
      {fold !== undefined && (
        <button
          type="button"
          className="map-node-fold"
          tabIndex={isActive ? 0 : -1}
          aria-expanded={fold.hidden === 0}
          aria-label={
            fold.hidden === 0
              ? "Collapse replies"
              : `Expand ${fold.hidden} hidden ${fold.hidden === 1 ? "turn" : "turns"}`
          }
          onClick={() => {
            onToggleCollapsed(turn.id);
          }}
        >
          {fold.hidden === 0 ? "−" : `+${fold.hidden}`}
        </button>
      )}
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
