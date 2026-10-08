import { z } from "zod";

import { describeGraphError, type GraphError } from "./errors.js";
import type { ConversationGraph } from "./graph.js";
import type { Conversation, GraphNode, NodeId, NodeMeta } from "./model.js";
import { createConversation, setNodeMeta } from "./operations.js";
import { err, ok, type Result } from "./result.js";
import {
  conversationSchema,
  graphNodeSchema,
  nodeMetaSchema,
} from "./schema.js";
import { insertNode } from "./validate.js";

export const FORMAT_ID = "diagram-4-llm.conversation";
export const FORMAT_VERSION = 1;

/** The exported form of one conversation. Serialise it with `JSON.stringify`. */
export interface ConversationDocument {
  readonly format: typeof FORMAT_ID;
  readonly formatVersion: typeof FORMAT_VERSION;
  readonly conversation: Conversation;
  /** In creation order. Every node only points to nodes before it. */
  readonly nodes: readonly GraphNode[];
  readonly meta: Readonly<Record<NodeId, NodeMeta>>;
}

export const conversationDocumentSchema = z.strictObject({
  format: z.literal(FORMAT_ID),
  formatVersion: z.literal(FORMAT_VERSION),
  conversation: conversationSchema,
  nodes: z.array(graphNodeSchema),
  meta: z.record(z.string().min(1), nodeMetaSchema),
}) satisfies z.ZodType<ConversationDocument>;

export type ImportError =
  | { readonly code: "invalid-document"; readonly issues: string }
  | { readonly code: "invalid-conversation"; readonly error: GraphError }
  | {
      readonly code: "invalid-node";
      readonly index: number;
      readonly nodeId: NodeId;
      readonly error: GraphError;
    }
  | {
      readonly code: "invalid-meta";
      readonly nodeId: NodeId;
      readonly error: GraphError;
    };

export function exportConversation(
  graph: ConversationGraph,
): ConversationDocument {
  return {
    format: FORMAT_ID,
    formatVersion: FORMAT_VERSION,
    conversation: graph.conversation,
    nodes: [...graph.nodes.values()],
    meta: Object.fromEntries(graph.meta),
  };
}

/**
 * Validates a parsed JSON value and rebuilds the graph by inserting each node
 * through the same checks as live operations. Either the whole document is
 * imported or nothing is.
 */
export function importConversation(
  input: unknown,
): Result<ConversationGraph, ImportError> {
  const parsed = conversationDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "invalid-document",
      issues: z.prettifyError(parsed.error),
    });
  }
  const document = parsed.data;

  const created = createConversation(document.conversation);
  if (!created.ok)
    return err({ code: "invalid-conversation", error: created.error });
  let graph = created.value;

  for (const [index, node] of document.nodes.entries()) {
    const inserted = insertNode(graph, node);
    if (!inserted.ok) {
      return err({
        code: "invalid-node",
        index,
        nodeId: node.id,
        error: inserted.error,
      });
    }
    graph = inserted.value;
  }

  for (const [nodeId, meta] of Object.entries(document.meta)) {
    const updated = setNodeMeta(graph, nodeId, meta);
    if (!updated.ok)
      return err({ code: "invalid-meta", nodeId, error: updated.error });
    graph = updated.value;
  }
  return ok(graph);
}

/** The reason a document was not imported, for people. */
export function describeImportError(error: ImportError): string {
  switch (error.code) {
    case "invalid-document":
      return error.issues;
    case "invalid-conversation":
      return describeGraphError(error.error);
    case "invalid-node":
      return `Node ${String(error.index)} (${error.nodeId}): ${describeGraphError(error.error)}`;
    case "invalid-meta":
      return `Metadata of ${error.nodeId}: ${describeGraphError(error.error)}`;
  }
}
