import {
  sessionForest,
  type ClaudeCodeSession,
  type SessionStep,
} from "@diagram-4-llm/core";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

import {
  layoutForest,
  NODE_HEIGHT,
  NODE_WIDTH,
  type Position as Point,
} from "../app/layout";
import { neighbour, type Direction } from "../app/navigation";
import { stepLabel, stepRole } from "../app/session";
import { FocusAfterKeyboardMove, FollowBranch } from "./ConversationMap";

interface StepData extends Record<string, unknown> {
  readonly step: SessionStep;
  readonly onBranch: boolean;
  readonly isSelected: boolean;
  /** The one node in the tab order; arrow keys move focus from it. */
  readonly isActive: boolean;
  readonly onSelect: (id: string) => void;
  readonly onFocusStep: (id: string) => void;
  readonly onNavigate: (id: string, direction: Direction) => void;
}

type StepFlowNode = Node<StepData, "step">;

interface Props {
  readonly session: ClaudeCodeSession;
  readonly branch: readonly SessionStep[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}

const nodeTypes = { step: StepNodeView };

const KEY_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: "parent",
  ArrowDown: "child",
  ArrowLeft: "previous",
  ArrowRight: "next",
};

/**
 * A Claude Code session as a tree, read-only. It is laid out and navigated
 * like the conversation map: arrow keys move along the tree, and
 * activating a step shows its branch next to the map.
 */
export function SessionMap({ session, branch, selectedId, onSelect }: Props) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [keyboardMove, setKeyboardMove] = useState<{
    readonly id: string;
    readonly position: Point;
  } | null>(null);
  const children = sessionForest(session);
  const positions = layoutForest(children);
  const onBranch = new Set(branch.map((step) => step.id));
  const activeId =
    focusId !== null && positions.has(focusId) ? focusId : selectedId;
  const onNavigate = (id: string, direction: Direction) => {
    const target = neighbour(children, id, direction, onBranch);
    const position = target === undefined ? undefined : positions.get(target);
    if (target === undefined || position === undefined) return;
    setFocusId(target);
    setKeyboardMove({ id: target, position });
  };

  const nodes: StepFlowNode[] = [];
  const edges: Edge[] = [];
  for (const step of session.steps) {
    const position = positions.get(step.id);
    if (position === undefined) continue;
    nodes.push({
      id: step.id,
      type: "step",
      position,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      data: {
        step,
        onBranch: onBranch.has(step.id),
        isSelected: step.id === selectedId,
        isActive: step.id === activeId,
        onSelect,
        onFocusStep: setFocusId,
        onNavigate,
      },
    });
    if (step.parentId !== null)
      edges.push({
        id: step.id,
        source: step.parentId,
        target: step.id,
        className: onBranch.has(step.id) ? "edge-branch" : "edge",
      });
  }

  return (
    <section className="map h-full bg-muted/40" aria-label="Session map">
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
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.5} />
        <Controls showInteractive={false} />
        <FollowBranch
          total={nodes.length}
          branchIds={branch
            .slice(0, branch.findIndex((step) => step.id === selectedId) + 1)
            .map((step) => step.id)}
        />
        <FocusAfterKeyboardMove move={keyboardMove} />
      </ReactFlow>
    </section>
  );
}

function StepNodeView({ data }: NodeProps<StepFlowNode>) {
  const {
    step,
    onBranch,
    isSelected,
    isActive,
    onSelect,
    onFocusStep,
    onNavigate,
  } = data;
  const classes = [
    "map-node",
    step.kind === "prompt" ? "map-node-user" : "",
    onBranch ? "map-node-branch" : "",
  ];
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <button
        type="button"
        className={classes.filter((c) => c !== "").join(" ")}
        aria-current={isSelected ? "true" : undefined}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
        data-turn-id={step.id}
        tabIndex={isActive ? 0 : -1}
        onClick={() => {
          onSelect(step.id);
        }}
        onFocus={() => {
          onFocusStep(step.id);
        }}
        onKeyDown={(event) => {
          const direction = KEY_DIRECTIONS[event.key];
          if (direction === undefined) return;
          event.preventDefault();
          onNavigate(step.id, direction);
        }}
      >
        <span className="map-node-role">{stepRole(step)}</span>
        <span className="map-node-label">{stepLabel(step)}</span>
      </button>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </>
  );
}
