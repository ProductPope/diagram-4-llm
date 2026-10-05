import type { NodeId } from "./model.js";

/**
 * Reasons an operation on a conversation graph is rejected. Each code maps to
 * an invariant in docs/ARCHITECTURE.md section 2.1.
 */
export type GraphError =
  | { readonly code: "invalid-conversation"; readonly issues: string }
  | { readonly code: "invalid-node"; readonly issues: string }
  | { readonly code: "invalid-meta"; readonly issues: string }
  | { readonly code: "duplicate-id"; readonly id: NodeId }
  | { readonly code: "unknown-node"; readonly id: NodeId }
  | { readonly code: "conversation-mismatch"; readonly id: NodeId }
  | { readonly code: "empty-content" }
  | { readonly code: "parent-not-assistant"; readonly parentId: NodeId }
  | { readonly code: "parent-not-user"; readonly parentId: NodeId }
  | { readonly code: "parent-not-finished"; readonly parentId: NodeId }
  | { readonly code: "ref-duplicate"; readonly refId: NodeId }
  | { readonly code: "ref-on-path"; readonly refId: NodeId }
  | { readonly code: "ref-not-finished"; readonly refId: NodeId }
  | { readonly code: "not-a-turn"; readonly id: NodeId }
  | { readonly code: "not-a-user-turn"; readonly id: NodeId }
  | { readonly code: "not-streaming"; readonly id: NodeId }
  | {
      readonly code: "summary-range";
      readonly fromId: NodeId;
      readonly toId: NodeId;
    }
  | { readonly code: "summary-not-finished"; readonly toId: NodeId }
  | { readonly code: "revision-mismatch"; readonly revisesId: NodeId }
  | { readonly code: "manifest-mismatch"; readonly id: NodeId };

export function describeGraphError(error: GraphError): string {
  switch (error.code) {
    case "invalid-conversation":
      return `Conversation does not match the data format: ${error.issues}`;
    case "invalid-meta":
      return `Node metadata does not match the data format: ${error.issues}`;
    case "invalid-node":
      return `Node does not match the data format: ${error.issues}`;
    case "duplicate-id":
      return `A node with id ${error.id} already exists.`;
    case "unknown-node":
      return `No node with id ${error.id} exists before this point.`;
    case "conversation-mismatch":
      return `Node ${error.id} belongs to a different conversation.`;
    case "empty-content":
      return "Message content is empty.";
    case "parent-not-assistant":
      return `A user turn must follow an assistant turn, but ${error.parentId} is not one.`;
    case "parent-not-user":
      return `An assistant turn must follow a user turn, but ${error.parentId} is not one.`;
    case "parent-not-finished":
      return `Turn ${error.parentId} has not finished successfully, so it cannot be continued.`;
    case "ref-duplicate":
      return `Node ${error.refId} is referenced more than once.`;
    case "ref-on-path":
      return `Node ${error.refId} is already part of this branch's context.`;
    case "ref-not-finished":
      return `Turn ${error.refId} has not finished successfully, so it cannot be referenced.`;
    case "not-a-turn":
      return `Node ${error.id} is not a user or assistant turn.`;
    case "not-a-user-turn":
      return `Node ${error.id} is not a user turn.`;
    case "not-streaming":
      return `Turn ${error.id} is not streaming.`;
    case "summary-range":
      return `${error.fromId} is not ${error.toId} or one of its ancestors.`;
    case "summary-not-finished":
      return `Turn ${error.toId} has not finished successfully, so it cannot be summarised.`;
    case "revision-mismatch":
      return `Summary ${error.revisesId} does not cover the same range, so this cannot be a revision of it.`;
    case "manifest-mismatch":
      return `The recorded context of turn ${error.id} does not match the conversation graph.`;
  }
}
