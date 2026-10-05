import type { GraphError } from "./errors.js";
import type {
  AssistantTurn,
  Conversation,
  GraphNode,
  NodeId,
  NodeMeta,
  TurnNode,
} from "./model.js";
import { err, ok, type Result } from "./result.js";

/**
 * An immutable conversation graph. Operations return a new graph and leave
 * the original unchanged.
 */
export interface ConversationGraph {
  readonly conversation: Conversation;
  /**
   * Nodes in creation order. Every node only points to nodes that come
   * before it, which is what keeps the graph acyclic.
   */
  readonly nodes: ReadonlyMap<NodeId, GraphNode>;
  readonly meta: ReadonlyMap<NodeId, NodeMeta>;
}

export function isTurn(node: GraphNode): node is TurnNode {
  return node.kind !== "summary";
}

/**
 * Whether a turn can be continued from, referenced or summarised. A turn
 * that is still streaming, failed, or produced no text would give the model
 * an incomplete or empty message.
 */
export function isUsable(node: TurnNode): boolean {
  if (node.kind === "user") return true;
  return isUsableAssistant(node);
}

function isUsableAssistant(node: AssistantTurn): boolean {
  return (
    (node.status === "complete" || node.status === "aborted") &&
    node.content.trim() !== ""
  );
}

/** Children of a turn in creation order, or the roots when `parentId` is `null`. */
export function childrenOf(
  graph: ConversationGraph,
  parentId: NodeId | null,
): TurnNode[] {
  const children: TurnNode[] = [];
  for (const node of graph.nodes.values()) {
    if (isTurn(node) && node.parentId === parentId) children.push(node);
  }
  return children;
}

/** The turns from the root down to `id`, root first, including `id`. */
export function pathTo(
  graph: ConversationGraph,
  id: NodeId,
): Result<readonly TurnNode[], GraphError> {
  const node = graph.nodes.get(id);
  if (node === undefined) return err({ code: "unknown-node", id });
  if (!isTurn(node)) return err({ code: "not-a-turn", id });
  return ok(ancestorsInclusive(graph, node));
}

/** Assumes a valid graph: every parent exists and is a turn. */
export function ancestorsInclusive(
  graph: ConversationGraph,
  turn: TurnNode,
): TurnNode[] {
  const path: TurnNode[] = [turn];
  let parentId = turn.parentId;
  while (parentId !== null) {
    const parent = graph.nodes.get(parentId);
    if (parent === undefined || !isTurn(parent)) {
      throw new Error(
        `Invariant violated: parent ${parentId} of a turn is missing or not a turn.`,
      );
    }
    path.push(parent);
    parentId = parent.parentId;
  }
  return path.reverse();
}
