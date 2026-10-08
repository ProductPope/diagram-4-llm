import type {
  ConversationGraph,
  NodeId,
  SummaryNode,
} from "@diagram-4-llm/core";

/**
 * The current summaries ending at each turn, in creation order. Editing a
 * summary adds a revision instead of changing it, so a summary that a later
 * one revises is left out; the original stays in the conversation and its
 * export.
 */
export function currentSummaries(
  graph: ConversationGraph,
): ReadonlyMap<NodeId, readonly SummaryNode[]> {
  const revised = new Set<NodeId>();
  for (const node of graph.nodes.values())
    if (node.kind === "summary" && node.revises !== undefined)
      revised.add(node.revises);

  const byEnd = new Map<NodeId, SummaryNode[]>();
  for (const node of graph.nodes.values()) {
    if (node.kind !== "summary" || revised.has(node.id)) continue;
    byEnd.set(node.covers.toId, [...(byEnd.get(node.covers.toId) ?? []), node]);
  }
  return byEnd;
}
