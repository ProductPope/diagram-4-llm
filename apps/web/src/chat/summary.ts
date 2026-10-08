import {
  addSummary,
  assembleForSummary,
  describeGraphError,
  type ConversationGraph,
  type NodeId,
  type ProviderErrorInfo,
  type Result,
  type TokenUsage,
} from "@diagram-4-llm/core";

import type { Environment, GenerationSettings } from "./generate";
import type { Store } from "./store";

/**
 * Sent as the system prompt instead of the user's own, which is written
 * for answering, not for summarising. Recorded with the summary.
 */
export const SUMMARY_INSTRUCTION =
  "You summarise conversations between a user and an assistant. The " +
  "conversation is given as a transcript of turns. Write a summary that " +
  "keeps the questions asked, the facts, decisions and conclusions " +
  "reached, and anything left open, so that it can replace the transcript " +
  "as context for a later conversation. Reply with the summary only.";

/**
 * Asks the model for a summary of the path segment `covers` and adds it to
 * the conversation. `onText` receives the summary as it is written. Only a
 * summary the model finished is saved: one cut off by a limit or refused
 * would silently lose part of the branch. Resolves with `null` when the
 * user stopped the request; nothing is saved then either.
 */
export async function summarise(
  graph: Store<ConversationGraph>,
  covers: { readonly fromId: NodeId; readonly toId: NodeId },
  settings: GenerationSettings,
  env: Environment,
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<Result<NodeId | null, ProviderErrorInfo>> {
  const context = assembleForSummary(graph.get(), covers, {
    systemPrompt: SUMMARY_INSTRUCTION,
  });
  if (!context.ok) return failure("graph", describeGraphError(context.error));

  let text = "";
  let usage: TokenUsage | undefined;
  for await (const event of settings.adapter.stream(
    { model: settings.model, context: context.value, params: settings.params },
    signal,
  )) {
    switch (event.type) {
      case "text":
        text += event.text;
        onText(text);
        break;
      case "done":
        if (event.stopReason !== "end")
          return failure(
            "summary-incomplete",
            event.stopReason === "max-tokens"
              ? "The summary was cut off by the output limit. Nothing was saved."
              : "The model did not finish the summary. Nothing was saved.",
          );
        usage = event.usage;
        break;
      case "aborted":
        return { ok: true, value: null };
      case "error":
        return { ok: false, error: event.error };
    }
  }
  if (text.trim() === "")
    return failure(
      "empty-summary",
      "The model replied with an empty summary. Nothing was saved.",
    );

  const id = env.newId();
  // Applied to the latest graph: the conversation may have changed meanwhile.
  const added = addSummary(graph.get(), {
    id,
    createdAt: env.now(),
    covers,
    content: text.trim(),
    generation: {
      adapter: settings.adapter.id,
      ...(settings.baseUrl === undefined ? {} : { baseUrl: settings.baseUrl }),
      model: settings.model,
      params: settings.params,
      systemPrompt: SUMMARY_INSTRUCTION,
      manifest: context.value.manifest,
      ...(usage === undefined ? {} : { usage }),
    },
  });
  if (!added.ok) return failure("graph", describeGraphError(added.error));
  graph.set(added.value);
  return { ok: true, value: id };
}

function failure(
  code: string,
  message: string,
): { ok: false; error: ProviderErrorInfo } {
  return { ok: false, error: { code, message } };
}
