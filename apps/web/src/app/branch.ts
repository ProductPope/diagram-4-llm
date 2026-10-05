import {
  childrenOf,
  pathTo,
  type ConversationGraph,
  type NodeId,
  type TurnNode,
} from "@diagram-4-llm/core";

/**
 * The branch shown in the reading pane: the path from the root to `anchor`,
 * continued through the most recent child at each step. With a `null`
 * anchor it starts at the most recent root. Following the newest child
 * means a message sent from the end of the branch appears in it without
 * moving the anchor.
 */
export function visibleBranch(
  graph: ConversationGraph,
  anchor: NodeId | null,
): TurnNode[] {
  const branch: TurnNode[] = [];
  if (anchor !== null) {
    const path = pathTo(graph, anchor);
    if (path.ok) branch.push(...path.value);
  }
  for (;;) {
    const children = childrenOf(graph, branch.at(-1)?.id ?? null);
    const newest = children.at(-1);
    if (newest === undefined) return branch;
    branch.push(newest);
  }
}

/** The turn and its siblings, in creation order, with the turn's position. */
export function siblingsOf(
  graph: ConversationGraph,
  turn: TurnNode,
): { siblings: TurnNode[]; index: number } {
  const siblings = childrenOf(graph, turn.parentId);
  return { siblings, index: siblings.findIndex((s) => s.id === turn.id) };
}
