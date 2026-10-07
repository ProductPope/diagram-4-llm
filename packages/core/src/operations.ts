import { z } from "zod";

import { assembleForUserTurn } from "./context.js";
import type { GraphError } from "./errors.js";
import type { ConversationGraph } from "./graph.js";
import type {
  AdapterId,
  AssistantTurn,
  Conversation,
  GenerationParams,
  GenerationRecord,
  ISODate,
  NodeId,
  NodeMeta,
  ProviderErrorInfo,
  StopReason,
  SummaryNode,
  TokenUsage,
  UserTurn,
} from "./model.js";
import { err, ok, type Result } from "./result.js";
import {
  assistantTurnSchema,
  conversationSchema,
  nodeMetaSchema,
} from "./schema.js";
import { checkAssistantParent } from "./rules.js";
import { insertNode } from "./validate.js";

// IDs and timestamps are supplied by the caller so that this package stays
// deterministic and free of I/O.

export function createConversation(
  conversation: Conversation,
): Result<ConversationGraph, GraphError> {
  const parsed = conversationSchema.safeParse(conversation);
  if (!parsed.success) {
    return err({
      code: "invalid-conversation",
      issues: z.prettifyError(parsed.error),
    });
  }
  return ok({ conversation, nodes: new Map(), meta: new Map() });
}

export interface NewUserTurn {
  readonly id: NodeId;
  readonly createdAt: ISODate;
  readonly parentId: NodeId | null;
  readonly refs: readonly NodeId[];
  readonly content: string;
}

export function addUserTurn(
  graph: ConversationGraph,
  input: NewUserTurn,
): Result<ConversationGraph, GraphError> {
  const turn: UserTurn = {
    kind: "user",
    id: input.id,
    conversationId: graph.conversation.id,
    parentId: input.parentId,
    content: input.content,
    refs: [...input.refs],
    createdAt: input.createdAt,
  };
  return insertNode(graph, turn);
}

export interface NewAssistantTurn {
  readonly id: NodeId;
  readonly createdAt: ISODate;
  /** The user turn being answered. */
  readonly parentId: NodeId;
  readonly adapter: AdapterId;
  readonly baseUrl?: string;
  readonly model: string;
  readonly params: GenerationParams;
  readonly systemPrompt: string | null;
}

/**
 * Adds an empty assistant turn in the `streaming` state. The context manifest
 * is computed here rather than accepted from the caller, so it always
 * matches the graph.
 */
export function startAssistantTurn(
  graph: ConversationGraph,
  input: NewAssistantTurn,
): Result<ConversationGraph, GraphError> {
  const parentViolation = checkAssistantParent(graph, input.parentId);
  if (parentViolation !== null) return err(parentViolation);
  const context = assembleForUserTurn(graph, input.parentId, {
    systemPrompt: input.systemPrompt,
  });
  if (!context.ok) return context;

  const generation: GenerationRecord = {
    adapter: input.adapter,
    ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
    model: input.model,
    params: input.params,
    systemPrompt: input.systemPrompt,
    manifest: context.value.manifest,
  };
  const turn: AssistantTurn = {
    kind: "assistant",
    id: input.id,
    conversationId: graph.conversation.id,
    parentId: input.parentId,
    content: "",
    status: "streaming",
    generation,
    createdAt: input.createdAt,
  };
  return insertNode(graph, turn);
}

export function appendAssistantContent(
  graph: ConversationGraph,
  id: NodeId,
  delta: string,
): Result<ConversationGraph, GraphError> {
  const turn = streamingTurn(graph, id);
  if (!turn.ok) return turn;
  return replaceNode(graph, {
    ...turn.value,
    content: turn.value.content + delta,
  });
}

export type AssistantOutcome =
  | {
      readonly status: "complete";
      readonly stopReason: StopReason;
      readonly usage?: TokenUsage;
    }
  | { readonly status: "aborted"; readonly usage?: TokenUsage }
  | {
      readonly status: "error";
      readonly error: ProviderErrorInfo;
      readonly usage?: TokenUsage;
    };

/** Moves a streaming turn to its final state. Content received so far is kept. */
export function finishAssistantTurn(
  graph: ConversationGraph,
  id: NodeId,
  outcome: AssistantOutcome,
): Result<ConversationGraph, GraphError> {
  const turn = streamingTurn(graph, id);
  if (!turn.ok) return turn;

  const { generation } = turn.value;
  const finished: AssistantTurn = {
    ...turn.value,
    status: outcome.status,
    ...(outcome.status === "complete"
      ? { stopReason: outcome.stopReason }
      : {}),
    ...(outcome.status === "error" ? { error: outcome.error } : {}),
    generation:
      outcome.usage === undefined
        ? generation
        : { ...generation, usage: outcome.usage },
  };
  return replaceNode(graph, finished);
}

export interface NewSummary {
  readonly id: NodeId;
  readonly createdAt: ISODate;
  readonly covers: { readonly fromId: NodeId; readonly toId: NodeId };
  readonly content: string;
  readonly revises?: NodeId;
  readonly generation?: GenerationRecord;
}

export function addSummary(
  graph: ConversationGraph,
  input: NewSummary,
): Result<ConversationGraph, GraphError> {
  const summary: SummaryNode = {
    kind: "summary",
    id: input.id,
    conversationId: graph.conversation.id,
    covers: { fromId: input.covers.fromId, toId: input.covers.toId },
    content: input.content,
    ...(input.revises === undefined ? {} : { revises: input.revises }),
    ...(input.generation === undefined ? {} : { generation: input.generation }),
    createdAt: input.createdAt,
  };
  return insertNode(graph, summary);
}

/**
 * Gives the conversation a new title. The title is free text, as when the
 * conversation is created, and the turns are not affected.
 */
export function renameConversation(
  graph: ConversationGraph,
  title: string,
): ConversationGraph {
  return { ...graph, conversation: { ...graph.conversation, title } };
}

/** Replaces the presentation state of a node. */
export function setNodeMeta(
  graph: ConversationGraph,
  id: NodeId,
  meta: NodeMeta,
): Result<ConversationGraph, GraphError> {
  if (!graph.nodes.has(id)) return err({ code: "unknown-node", id });
  const parsed = nodeMetaSchema.safeParse(meta);
  if (!parsed.success)
    return err({ code: "invalid-meta", issues: z.prettifyError(parsed.error) });
  return ok({ ...graph, meta: new Map(graph.meta).set(id, meta) });
}

function streamingTurn(
  graph: ConversationGraph,
  id: NodeId,
): Result<AssistantTurn, GraphError> {
  const node = graph.nodes.get(id);
  if (node === undefined) return err({ code: "unknown-node", id });
  if (node.kind !== "assistant" || node.status !== "streaming") {
    return err({ code: "not-streaming", id });
  }
  return ok(node);
}

/**
 * Updates a streaming turn in place. Map.set on an existing key keeps its
 * position, so creation order is preserved. The schema check keeps
 * caller-supplied values (usage, error) within the data format, so every
 * graph can be exported and imported again.
 */
function replaceNode(
  graph: ConversationGraph,
  node: AssistantTurn,
): Result<ConversationGraph, GraphError> {
  const parsed = assistantTurnSchema.safeParse(node);
  if (!parsed.success)
    return err({ code: "invalid-node", issues: z.prettifyError(parsed.error) });
  return ok({ ...graph, nodes: new Map(graph.nodes).set(node.id, node) });
}
