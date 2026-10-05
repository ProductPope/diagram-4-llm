import type { GraphError } from "./errors.js";
import { ancestorsInclusive, pathTo, type ConversationGraph } from "./graph.js";
import type {
  ContextManifest,
  ContextManifestEntry,
  GraphNode,
  NodeId,
  TurnNode,
} from "./model.js";
import { err, ok, type Result } from "./result.js";
import { checkUserTurn } from "./rules.js";

export interface ProviderMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/** Exactly what is sent to a model, and where each part came from. */
export interface AssembledContext {
  readonly system: string | null;
  readonly messages: readonly ProviderMessage[];
  readonly manifest: ContextManifest;
}

/** A user turn that has not been added to the graph yet. */
export interface ContextDraft {
  readonly parentId: NodeId | null;
  readonly refs: readonly NodeId[];
  readonly content: string;
}

export interface AssemblyOptions {
  readonly systemPrompt: string | null;
}

/**
 * Rough token estimate: about four characters per token for English text.
 * Exact tokenizers are not available for every model in the browser, so
 * callers must present this as an estimate.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Context that would be sent if `draft` were added as a new user turn. */
export function assembleContext(
  graph: ConversationGraph,
  draft: ContextDraft,
  options: AssemblyOptions,
): Result<AssembledContext, GraphError> {
  const violation = checkUserTurn(graph, draft);
  if (violation !== null) return err(violation);

  let path: readonly TurnNode[] = [];
  if (draft.parentId !== null) {
    const parentPath = pathTo(graph, draft.parentId);
    if (!parentPath.ok) return parentPath;
    path = parentPath.value;
  }
  const draftSegment: Segment = { ...draft, role: "user", nodeId: null };
  return ok(render(graph, [...path.map(fromTurn), draftSegment], options));
}

/** Context for generating an answer to an existing user turn. */
export function assembleForUserTurn(
  graph: ConversationGraph,
  userTurnId: NodeId,
  options: AssemblyOptions,
): Result<AssembledContext, GraphError> {
  const turn = graph.nodes.get(userTurnId);
  if (turn === undefined) return err({ code: "unknown-node", id: userTurnId });
  if (turn.kind !== "user")
    return err({ code: "not-a-user-turn", id: userTurnId });
  return ok(
    render(graph, ancestorsInclusive(graph, turn).map(fromTurn), options),
  );
}

interface Segment {
  readonly role: "user" | "assistant";
  readonly refs: readonly NodeId[];
  readonly content: string;
  /** `null` for a draft that is not in the graph yet. */
  readonly nodeId: NodeId | null;
}

function fromTurn(turn: TurnNode): Segment {
  return {
    role: turn.kind,
    refs: turn.kind === "user" ? turn.refs : [],
    content: turn.content,
    nodeId: turn.id,
  };
}

function render(
  graph: ConversationGraph,
  segments: readonly Segment[],
  options: AssemblyOptions,
): AssembledContext {
  const messages: ProviderMessage[] = [];
  const entries: ContextManifestEntry[] = [];

  for (const segment of segments) {
    const blocks: string[] = [];
    for (const refId of segment.refs) {
      const ref = graph.nodes.get(refId);
      if (ref === undefined) {
        throw new Error(
          `Invariant violated: referenced node ${refId} is missing.`,
        );
      }
      blocks.push(renderReference(ref));
      entries.push({ nodeId: refId, via: "ref" });
    }
    blocks.push(segment.content);
    messages.push({ role: segment.role, content: blocks.join("\n\n") });
    if (segment.nodeId !== null)
      entries.push({ nodeId: segment.nodeId, via: "path" });
  }

  const system = options.systemPrompt;
  const estimatedInputTokens =
    estimateTokens(system ?? "") +
    messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);

  return { system, messages, manifest: { entries, estimatedInputTokens } };
}

/**
 * The delimiters let the model tell referenced material apart from the
 * user's own words. They are a convention, not an escaping mechanism: the
 * content is the user's own data and is included verbatim.
 */
function renderReference(node: GraphNode): string {
  return `<context source="${node.kind}" node="${node.id}">\n${node.content}\n</context>`;
}
