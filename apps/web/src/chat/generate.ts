import {
  addUserTurn,
  appendAssistantContent,
  assembleForUserTurn,
  finishAssistantTurn,
  startAssistantTurn,
  type AssistantOutcome,
  type ContextDraft,
  type ConversationGraph,
  type GenerationParams,
  type GraphError,
  type ISODate,
  type NodeId,
  type Result,
} from "@diagram-4-llm/core";

import type { ProviderAdapter, StreamEvent } from "../providers/types";
import type { Store } from "./store";

export interface GenerationSettings {
  readonly adapter: ProviderAdapter;
  /** Recorded with the answer for `openai-compatible` adapters. */
  readonly baseUrl?: string;
  readonly model: string;
  readonly params: GenerationParams;
  readonly systemPrompt: string | null;
}

export interface Environment {
  readonly newId: () => NodeId;
  readonly now: () => ISODate;
}

/**
 * Adds the draft as a user turn and streams an answer to it. Resolves with
 * the IDs of both turns once the answer has finished, whatever the outcome.
 */
export async function sendMessage(
  graph: Store<ConversationGraph>,
  draft: ContextDraft,
  settings: GenerationSettings,
  env: Environment,
  signal: AbortSignal,
): Promise<
  Result<{ userTurnId: NodeId; assistantTurnId: NodeId }, GraphError>
> {
  const userTurnId = env.newId();
  const added = addUserTurn(graph.get(), {
    id: userTurnId,
    createdAt: env.now(),
    ...draft,
  });
  if (!added.ok) return added;
  graph.set(added.value);

  const answered = await generateAnswer(
    graph,
    userTurnId,
    settings,
    env,
    signal,
  );
  return answered.ok
    ? { ok: true, value: { userTurnId, assistantTurnId: answered.value } }
    : answered;
}

/**
 * Streams a new answer to an existing user turn, as a sibling of any
 * earlier answers. Each event is applied to the store's current graph, not
 * to a copy taken at the start, so changes made elsewhere while the answer
 * streams are kept.
 */
export async function generateAnswer(
  graph: Store<ConversationGraph>,
  userTurnId: NodeId,
  settings: GenerationSettings,
  env: Environment,
  signal: AbortSignal,
): Promise<Result<NodeId, GraphError>> {
  const id = env.newId();
  const started = startAssistantTurn(graph.get(), {
    id,
    createdAt: env.now(),
    parentId: userTurnId,
    adapter: settings.adapter.id,
    ...(settings.baseUrl === undefined ? {} : { baseUrl: settings.baseUrl }),
    model: settings.model,
    params: settings.params,
    systemPrompt: settings.systemPrompt,
  });
  if (!started.ok) return started;
  graph.set(started.value);

  const context = assembleForUserTurn(graph.get(), userTurnId, {
    systemPrompt: settings.systemPrompt,
  });
  if (!context.ok) return context;

  let outcome: AssistantOutcome = {
    status: "error",
    error: {
      code: "no-result",
      message: "The provider ended the stream without a result.",
    },
  };
  for await (const event of settings.adapter.stream(
    { model: settings.model, context: context.value, params: settings.params },
    signal,
  )) {
    if (event.type === "text") {
      const appended = applyTo(graph, (g) =>
        appendAssistantContent(g, id, event.text),
      );
      if (!appended.ok) return appended;
      continue;
    }
    outcome = toOutcome(event);
  }

  const finished = applyTo(graph, (g) => finishAssistantTurn(g, id, outcome));
  return finished.ok ? { ok: true, value: id } : finished;
}

function toOutcome(
  event: Exclude<StreamEvent, { type: "text" }>,
): AssistantOutcome {
  switch (event.type) {
    case "done":
      return event.usage === undefined
        ? { status: "complete", stopReason: event.stopReason }
        : {
            status: "complete",
            stopReason: event.stopReason,
            usage: event.usage,
          };
    case "aborted":
      return event.usage === undefined
        ? { status: "aborted" }
        : { status: "aborted", usage: event.usage };
    case "error":
      return { status: "error", error: event.error };
  }
}

/** Applies a graph operation to the store's current value and reports its result. */
function applyTo(
  graph: Store<ConversationGraph>,
  operation: (
    current: ConversationGraph,
  ) => Result<ConversationGraph, GraphError>,
): Result<void, GraphError> {
  const result = operation(graph.get());
  if (!result.ok) return result;
  graph.set(result.value);
  return { ok: true, value: undefined };
}
