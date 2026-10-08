import {
  estimateTokens,
  type ConversationGraph,
  type NodeId,
} from "@diagram-4-llm/core";

/**
 * From this share of the context window on, the user is warned: the
 * estimate is rough, and the answer needs room in the window too.
 */
export const NEAR_SHARE = 0.8;

export type ContextBudget =
  | { readonly status: "unknown" }
  | {
      readonly status: "ok" | "near" | "over";
      readonly estimated: number;
      readonly window: number;
    };

/**
 * How an estimated context compares with the model's context window, when
 * the user has given one. Over the window, sending is blocked; nothing is
 * ever cut to make it fit.
 */
export function contextBudget(
  estimated: number,
  window: number | undefined,
): ContextBudget {
  if (window === undefined) return { status: "unknown" };
  const status =
    estimated > window
      ? "over"
      : estimated >= window * NEAR_SHARE
        ? "near"
        : "ok";
  return { status, estimated, window };
}

/**
 * The attached nodes with the estimated size of each, largest first: the
 * ones whose removal frees the most room.
 */
export function referencesBySize(
  graph: ConversationGraph,
  refs: readonly NodeId[],
): { readonly id: NodeId; readonly tokens: number }[] {
  return refs
    .flatMap((id) => {
      const node = graph.nodes.get(id);
      return node === undefined
        ? []
        : [{ id, tokens: estimateTokens(node.content) }];
    })
    .sort((a, b) => b.tokens - a.tokens);
}
