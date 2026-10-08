import type { GraphNode } from "@diagram-4-llm/core";

/** The start of a node's text on one line, for a node without a title. */
export function labelOf(node: GraphNode): string {
  const text = node.content.trim().replace(/\s+/g, " ");
  if (text === "")
    return node.kind === "assistant" && node.status === "streaming"
      ? "…"
      : "(empty)";
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}
