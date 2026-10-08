import {
  isTurn,
  isUsable,
  pathTo,
  type ConversationGraph,
  type NodeId,
  type TurnNode,
} from "@diagram-4-llm/core";

/**
 * Why a turn cannot be attached to a new message that continues from
 * `parentId`: an unfinished turn would give the model an incomplete
 * message, and a turn already on the branch is in the context anyway.
 */
export type ReferenceProblem = "unfinished" | "on-path";

/**
 * Tells why a turn cannot be attached to a new message after `parentId`
 * (`null` for a new root), or null when it can. These are the core's rules
 * for references, checked here so the app offers only valid choices. The
 * branch is looked up once, because the map checks every turn.
 */
export function referenceChecker(
  graph: ConversationGraph,
  parentId: NodeId | null,
): (turn: TurnNode) => ReferenceProblem | null {
  const path = parentId === null ? null : pathTo(graph, parentId);
  // An unknown parent is reported by the core when the message is sent.
  const onPath = new Set(path?.ok === true ? path.value.map((t) => t.id) : []);
  return (turn) => {
    if (!isUsable(turn)) return "unfinished";
    return onPath.has(turn.id) ? "on-path" : null;
  };
}

/**
 * The attached turns that are on the branch a message after `parentId`
 * continues. That happens when another branch is chosen after attaching,
 * and the message cannot be sent until they are removed.
 */
export function referencesOnPath(
  graph: ConversationGraph,
  parentId: NodeId | null,
  refs: readonly NodeId[],
): ReadonlySet<NodeId> {
  const problem = referenceChecker(graph, parentId);
  return new Set(
    refs.filter((id) => {
      const node = graph.nodes.get(id);
      return node !== undefined && isTurn(node) && problem(node) === "on-path";
    }),
  );
}

/** `refs` with `id` added at the end, or without it if it was attached. */
export function toggleReference(
  refs: readonly NodeId[],
  id: NodeId,
): readonly NodeId[] {
  return refs.includes(id) ? refs.filter((ref) => ref !== id) : [...refs, id];
}
