import type { GraphError } from "./errors.js";
import {
  ancestorsInclusive,
  isTurn,
  isUsable,
  type ConversationGraph,
} from "./graph.js";
import type { AssistantTurn, NodeId, SummaryNode } from "./model.js";

// Structural rules shared by graph operations, context assembly of drafts,
// and import. Each returns the first violation found, or null.

export function checkUserTurn(
  graph: ConversationGraph,
  turn: { parentId: NodeId | null; refs: readonly NodeId[]; content: string },
): GraphError | null {
  if (turn.content.trim() === "") return { code: "empty-content" };

  const pathIds = new Set<NodeId>();
  if (turn.parentId !== null) {
    const parent = graph.nodes.get(turn.parentId);
    if (parent === undefined)
      return { code: "unknown-node", id: turn.parentId };
    if (parent.kind !== "assistant") {
      return { code: "parent-not-assistant", parentId: turn.parentId };
    }
    if (!isUsable(parent)) {
      return { code: "parent-not-finished", parentId: turn.parentId };
    }
    for (const node of ancestorsInclusive(graph, parent)) pathIds.add(node.id);
  }

  const seen = new Set<NodeId>();
  for (const refId of turn.refs) {
    if (seen.has(refId)) return { code: "ref-duplicate", refId };
    seen.add(refId);
    const ref = graph.nodes.get(refId);
    if (ref === undefined) return { code: "unknown-node", id: refId };
    if (pathIds.has(refId)) return { code: "ref-on-path", refId };
    if (isTurn(ref) && !isUsable(ref))
      return { code: "ref-not-finished", refId };
  }
  return null;
}

export function checkAssistantParent(
  graph: ConversationGraph,
  parentId: NodeId,
): GraphError | null {
  const parent = graph.nodes.get(parentId);
  if (parent === undefined) return { code: "unknown-node", id: parentId };
  if (parent.kind !== "user") return { code: "parent-not-user", parentId };
  return null;
}

export function checkSummary(
  graph: ConversationGraph,
  summary: Pick<SummaryNode, "covers" | "content" | "revises">,
): GraphError | null {
  if (summary.content.trim() === "") return { code: "empty-content" };

  const { fromId, toId } = summary.covers;
  const from = graph.nodes.get(fromId);
  if (from === undefined) return { code: "unknown-node", id: fromId };
  if (!isTurn(from)) return { code: "not-a-turn", id: fromId };
  const to = graph.nodes.get(toId);
  if (to === undefined) return { code: "unknown-node", id: toId };
  if (!isTurn(to)) return { code: "not-a-turn", id: toId };
  if (!isUsable(to)) return { code: "summary-not-finished", toId };
  if (!ancestorsInclusive(graph, to).some((node) => node.id === fromId)) {
    return { code: "summary-range", fromId, toId };
  }

  if (summary.revises !== undefined) {
    const revised = graph.nodes.get(summary.revises);
    if (revised === undefined)
      return { code: "unknown-node", id: summary.revises };
    if (
      revised.kind !== "summary" ||
      revised.covers.fromId !== fromId ||
      revised.covers.toId !== toId
    ) {
      return { code: "revision-mismatch", revisesId: summary.revises };
    }
  }
  return null;
}

/** A stop reason belongs to complete turns only, and an error to failed ones. */
export function checkAssistantState(turn: AssistantTurn): GraphError | null {
  const consistent =
    (turn.stopReason !== undefined) === (turn.status === "complete") &&
    (turn.error !== undefined) === (turn.status === "error");
  return consistent ? null : { code: "inconsistent-status", id: turn.id };
}
