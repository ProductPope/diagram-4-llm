import { assembleForUserTurn } from "./context.js";
import type { GraphError } from "./errors.js";
import type { ConversationGraph } from "./graph.js";
import type { ContextManifestEntry, GraphNode } from "./model.js";
import { err, ok, type Result } from "./result.js";
import { checkAssistantParent, checkSummary, checkUserTurn } from "./rules.js";
import { graphNodeSchema } from "./schema.js";
import { z } from "zod";

/**
 * Adds a node after checking every invariant against the nodes before it.
 * This is the only way nodes enter a graph, both for new nodes and for
 * imported ones, so a graph that exists is a valid graph.
 */
export function insertNode(
  graph: ConversationGraph,
  node: GraphNode,
): Result<ConversationGraph, GraphError> {
  const violation = checkNewNode(graph, node);
  if (violation !== null) return err(violation);
  return ok({ ...graph, nodes: new Map(graph.nodes).set(node.id, node) });
}

function checkNewNode(
  graph: ConversationGraph,
  node: GraphNode,
): GraphError | null {
  const parsed = graphNodeSchema.safeParse(node);
  if (!parsed.success)
    return { code: "invalid-node", issues: z.prettifyError(parsed.error) };
  if (graph.nodes.has(node.id)) return { code: "duplicate-id", id: node.id };
  if (node.conversationId !== graph.conversation.id) {
    return { code: "conversation-mismatch", id: node.id };
  }

  switch (node.kind) {
    case "user":
      return checkUserTurn(graph, node);
    case "summary":
      return checkSummary(graph, node);
    case "assistant": {
      const parentViolation = checkAssistantParent(graph, node.parentId);
      if (parentViolation !== null) return parentViolation;
      // The recorded context must be the one the graph implies, so that the
      // context inspector can be trusted for past answers too.
      const expected = assembleForUserTurn(graph, node.parentId, {
        systemPrompt: node.generation.systemPrompt,
      });
      if (!expected.ok) return expected.error;
      if (
        !sameEntries(
          expected.value.manifest.entries,
          node.generation.manifest.entries,
        )
      ) {
        return { code: "manifest-mismatch", id: node.id };
      }
      return null;
    }
  }
}

function sameEntries(
  a: readonly ContextManifestEntry[],
  b: readonly ContextManifestEntry[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (entry, i) => b[i]?.nodeId === entry.nodeId && b[i].via === entry.via,
    )
  );
}
