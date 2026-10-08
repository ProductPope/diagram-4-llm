import {
  isUsable,
  type ConversationGraph,
  type NodeId,
  type TurnNode,
} from "@diagram-4-llm/core";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "#components/ui/context-menu";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  GitMerge,
  ScrollText,
  GitFork,
  Paperclip,
  Pencil,
} from "lucide-react";
import { useEffect, useState } from "react";

import { branchPoint } from "../app/branchPoint";
import { visibleForest } from "../app/collapse";
import { labelOf } from "../app/label";
import {
  layoutForest,
  NODE_HEIGHT,
  NODE_WIDTH,
  type Position as Point,
} from "../app/layout";
import { neighbour, type Direction } from "../app/navigation";
import { referenceChecker } from "../app/references";

interface TurnData extends Record<string, unknown> {
  readonly turn: TurnNode;
  readonly onBranch: boolean;
  readonly isTip: boolean;
  /** The answer a new branch from this node continues from, if any. */
  readonly branchFrom: NodeId | undefined;
  /** A generated or user-given title, shown instead of the message start. */
  readonly title: string | undefined;
  /** The one node in the tab order; arrow keys move focus from it. */
  readonly isActive: boolean;
  /** Present only for nodes with children. */
  readonly fold?: { readonly hidden: number };
  /** Whether the turn is attached to the message being written, or can be. */
  readonly attachment: "attached" | "attachable" | "unavailable";
  readonly onSelect: (id: NodeId) => void;
  readonly onToggleCollapsed: (id: NodeId) => void;
  readonly onEdit: (turn: TurnNode) => void;
  readonly onBranchFrom: (answerId: NodeId) => void;
  readonly onToggleReference: (id: NodeId) => void;
  readonly onSummarise: ((answerId: NodeId) => void) | undefined;
  readonly onAttachSummary: ((answerId: NodeId) => void) | undefined;
  readonly onFocusTurn: (id: NodeId) => void;
  readonly onNavigate: (id: NodeId, direction: Direction) => void;
}

type TurnFlowNode = Node<TurnData, "turn">;

interface Props {
  readonly graph: ConversationGraph;
  readonly branch: readonly TurnNode[];
  readonly onSelect: (id: NodeId) => void;
  readonly onToggleCollapsed: (id: NodeId) => void;
  readonly onEdit: (turn: TurnNode) => void;
  readonly onBranchFrom: (answerId: NodeId) => void;
  /**
   * Where the message being written continues, which decides the turns
   * that can be attached to it; undefined when no message can be sent.
   */
  readonly attachTo: NodeId | null | undefined;
  /** Turns attached to the message being written. */
  readonly attached: readonly NodeId[];
  readonly onToggleReference: (id: NodeId) => void;
  /** Summarises the branch up to an answer; absent without a provider. */
  readonly onSummarise: ((answerId: NodeId) => void) | undefined;
  /**
   * Attaches the summary of the branch up to an answer to the message
   * being written, writing one first if there is none.
   */
  readonly onAttachSummary: ((answerId: NodeId) => void) | undefined;
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
 * layout; Enter shows the focused turn's branch, and E edits a focused
 * message of the user, which forks the conversation at that message.
 * Each node also has a context menu (right click, or the keyboard's
 * context menu key) with the same actions plus "Branch from here", which
 * continues after the node's exchange (see branchPoint). The A key
 * attaches the focused turn to the message being written, or removes it
 * again, so a turn from another branch can be part of the next message's
 * context.
 */
export function ConversationMap({
  graph,
  branch,
  onSelect,
  onToggleCollapsed,
  onEdit,
  onBranchFrom,
  attachTo,
  attached,
  onToggleReference,
  onSummarise,
  onAttachSummary,
}: Props) {
  const [focusId, setFocusId] = useState<NodeId | null>(null);
  const [keyboardMove, setKeyboardMove] = useState<{
    readonly id: NodeId;
    readonly position: Point;
  } | null>(null);
  const onBranch = new Set(branch.map((turn) => turn.id));
  const referenceProblem =
    attachTo === undefined ? undefined : referenceChecker(graph, attachTo);
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
        branchFrom: branchPoint(graph, node, onBranch),
        title: graph.meta.get(node.id)?.title,
        isActive: node.id === activeId,
        ...(children.has(node.id) ? { fold: { hidden: hidden ?? 0 } } : {}),
        attachment: attached.includes(node.id)
          ? "attached"
          : referenceProblem?.(node) === null
            ? "attachable"
            : "unavailable",
        onSelect,
        onToggleCollapsed,
        onEdit,
        onBranchFrom,
        onToggleReference,
        onSummarise,
        onAttachSummary: attachTo === undefined ? undefined : onAttachSummary,
        onFocusTurn: setFocusId,
        onNavigate,
      },
    });
  }

  return (
    <section className="map h-full bg-muted/40" aria-label="Conversation map">
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
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.5} />
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
 * It also refits when the map changes size: a map restored from the strip
 * mounts while its panel is still growing, and the first fit would leave
 * part of the tree outside.
 */
export function FollowBranch({
  total,
  branchIds,
}: {
  readonly total: number;
  readonly branchIds: readonly NodeId[];
}) {
  const { fitView } = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
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
  }, [total, tail, width, height, fitView]);
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
export function FocusAfterKeyboardMove({
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
    branchFrom,
    title,
    isActive,
    fold,
    attachment,
    onSelect,
    onToggleCollapsed,
    onEdit,
    onBranchFrom,
    onToggleReference,
    onSummarise,
    onAttachSummary,
    onFocusTurn,
    onNavigate,
  } = data;
  const classes = [
    "map-node",
    `map-node-${turn.kind}`,
    onBranch ? "map-node-branch" : "",
    turn.kind === "assistant" ? `map-node-${turn.status}` : "",
    attachment === "attached" ? "map-node-attached" : "",
  ];
  const canToggleReference = attachment !== "unavailable";
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      {/* Not modal: a modal menu locks page scrolling with an injected
          style element, which the Content Security Policy blocks. */}
      <ContextMenu modal={false}>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            className={classes.filter((c) => c !== "").join(" ")}
            aria-current={isTip ? "true" : undefined}
            aria-keyshortcuts={[
              "ArrowUp ArrowDown ArrowLeft ArrowRight",
              turn.kind === "user" ? "E" : "",
              canToggleReference ? "A" : "",
            ]
              .filter((keys) => keys !== "")
              .join(" ")}
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
              const letter =
                event.ctrlKey || event.metaKey || event.altKey
                  ? undefined
                  : event.key.toLowerCase();
              if (turn.kind === "user" && letter === "e") {
                event.preventDefault();
                onEdit(turn);
                return;
              }
              if (canToggleReference && letter === "a") {
                event.preventDefault();
                onToggleReference(turn.id);
                return;
              }
              const direction = KEY_DIRECTIONS[event.key];
              if (direction === undefined) return;
              event.preventDefault();
              onNavigate(turn.id, direction);
            }}
          >
            <span className="map-node-role">
              {turn.kind === "user" ? "You" : turn.generation.model}
              {attachment === "attached" && " · attached"}
            </span>
            <span className="map-node-label">{title ?? labelOf(turn)}</span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem
            disabled={branchFrom === undefined}
            onSelect={() => {
              if (branchFrom !== undefined) onBranchFrom(branchFrom);
            }}
          >
            <GitFork aria-hidden="true" />
            Branch from here
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canToggleReference}
            onSelect={() => {
              onToggleReference(turn.id);
            }}
          >
            <Paperclip aria-hidden="true" />
            {attachment === "attached"
              ? "Remove from your message"
              : "Attach to your message"}
          </ContextMenuItem>
          {turn.kind === "assistant" && onSummarise !== undefined && (
            <ContextMenuItem
              disabled={!isUsable(turn)}
              onSelect={() => {
                onSummarise(turn.id);
              }}
            >
              <ScrollText aria-hidden="true" />
              Summarise the branch up to here
            </ContextMenuItem>
          )}
          {turn.kind === "assistant" && onAttachSummary !== undefined && (
            <ContextMenuItem
              disabled={!isUsable(turn)}
              onSelect={() => {
                onAttachSummary(turn.id);
              }}
            >
              <GitMerge aria-hidden="true" />
              Attach a summary of this branch
            </ContextMenuItem>
          )}
          {turn.kind === "user" && (
            <ContextMenuItem
              onSelect={() => {
                onEdit(turn);
              }}
            >
              <Pencil aria-hidden="true" />
              New version of this message
            </ContextMenuItem>
          )}
          <ContextMenuItem
            onSelect={() => {
              onSelect(turn.id);
            }}
          >
            <Eye aria-hidden="true" />
            Show in conversation
          </ContextMenuItem>
          {fold !== undefined && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => {
                  onToggleCollapsed(turn.id);
                }}
              >
                {fold.hidden === 0 ? (
                  <ChevronsDownUp aria-hidden="true" />
                ) : (
                  <ChevronsUpDown aria-hidden="true" />
                )}
                {fold.hidden === 0 ? "Collapse replies" : "Expand replies"}
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
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
