import {
  addUserTurn,
  appendAssistantContent,
  createConversation,
  finishAssistantTurn,
  startAssistantTurn,
  type ConversationGraph,
  type NodeId,
  type Result,
} from "../src/index.js";

export const CREATED_AT = "2026-01-01T00:00:00.000Z";

export function unwrap<T>(result: Result<T, unknown>): T {
  if (!result.ok)
    throw new Error(`Expected ok, got ${JSON.stringify(result.error)}`);
  return result.value;
}

export function errorOf(result: Result<unknown, unknown>): unknown {
  if (result.ok) throw new Error("Expected an error, got ok");
  return result.error;
}

export function newGraph(): ConversationGraph {
  return unwrap(
    createConversation({ id: "c1", title: "Test", createdAt: CREATED_AT }),
  );
}

export function say(
  graph: ConversationGraph,
  id: NodeId,
  parentId: NodeId | null,
  content: string,
  refs: readonly NodeId[] = [],
): ConversationGraph {
  return unwrap(
    addUserTurn(graph, { id, createdAt: CREATED_AT, parentId, refs, content }),
  );
}

export function startAnswer(
  graph: ConversationGraph,
  id: NodeId,
  parentId: NodeId,
): ConversationGraph {
  return unwrap(
    startAssistantTurn(graph, {
      id,
      createdAt: CREATED_AT,
      parentId,
      adapter: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      model: "test-model",
      params: {},
      systemPrompt: null,
    }),
  );
}

/** Adds a complete assistant turn. */
export function answer(
  graph: ConversationGraph,
  id: NodeId,
  parentId: NodeId,
  content: string,
): ConversationGraph {
  let next = startAnswer(graph, id, parentId);
  next = unwrap(appendAssistantContent(next, id, content));
  return unwrap(
    finishAssistantTurn(next, id, { status: "complete", stopReason: "end" }),
  );
}
