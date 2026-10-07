import {
  childrenOf,
  isUsable,
  type ConversationGraph,
  type NodeId,
  type TurnNode,
} from "@diagram-4-llm/core";

/**
 * Where a new branch starts when the user branches from `turn`: the turn
 * itself for an answer, and for a question the answer to it, so the branch
 * keeps the whole exchange. A question with several answers uses the one
 * on the selected branch, otherwise the newest. Undefined when there is no
 * finished answer to continue from.
 */
export function branchPoint(
  graph: ConversationGraph,
  turn: TurnNode,
  onBranch: ReadonlySet<NodeId>,
): NodeId | undefined {
  if (turn.kind === "assistant") return isUsable(turn) ? turn.id : undefined;
  const answers = childrenOf(graph, turn.id).filter(isUsable);
  return (answers.find((answer) => onBranch.has(answer.id)) ?? answers.at(-1))
    ?.id;
}
