import type {
  ConversationGraph,
  NodeId,
  ProviderErrorInfo,
  Result,
} from "@diagram-4-llm/core";

import type { ProviderAdapter } from "../providers/types";

const INSTRUCTION =
  "You suggest where a conversation could go next. Given a question and " +
  "its answer, reply with three short follow-up questions the user might " +
  "ask, each taking the conversation in a different direction. Write each " +
  "question on its own line, in the language of the conversation, without " +
  "numbering or any other text.";
/** Room for three short questions, plus a little for models that pad. */
const MAX_OUTPUT_TOKENS = 200;
const MAX_SUGGESTIONS = 3;

/**
 * Asks `model` for follow-up questions to a finished answer. The request
 * contains only the answer and the question it answers, and the result is
 * never added to the conversation: a suggestion becomes a message only when
 * the user sends it. Resolves with `null` when there is nothing to suggest
 * for (the answer is unfinished) or the user stopped the request.
 */
export async function suggestFollowUps(
  graph: ConversationGraph,
  answerId: NodeId,
  adapter: ProviderAdapter,
  model: string,
  signal: AbortSignal,
): Promise<Result<readonly string[] | null, ProviderErrorInfo>> {
  const answer = graph.nodes.get(answerId);
  if (answer === undefined)
    return failure("unknown-node", `No turn with ID ${answerId}.`);
  if (answer.kind !== "assistant" || answer.status !== "complete")
    return { ok: true, value: null };
  const question = graph.nodes.get(answer.parentId);
  if (question === undefined)
    return failure("unknown-node", `No turn with ID ${answer.parentId}.`);

  let text = "";
  for await (const event of adapter.stream(
    {
      model,
      context: {
        system: INSTRUCTION,
        messages: [
          {
            role: "user",
            content: `Question:\n${question.content}\n\nAnswer:\n${answer.content}`,
          },
        ],
      },
      params: { maxOutputTokens: MAX_OUTPUT_TOKENS },
    },
    signal,
  )) {
    switch (event.type) {
      case "text":
        text += event.text;
        break;
      case "done":
        break;
      case "aborted":
        return { ok: true, value: null };
      case "error":
        return { ok: false, error: event.error };
    }
  }

  const suggestions = parseSuggestions(text);
  return suggestions.length === 0
    ? failure("no-suggestions", "The model suggested no follow-up questions.")
    : { ok: true, value: suggestions };
}

/**
 * Models often number or bullet the lines despite the instruction. Keeps
 * up to three distinct non-empty lines without those markers.
 */
export function parseSuggestions(reply: string): string[] {
  const lines = reply
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^(?:[-*•]|\d+[.)])\s*/, "")
        .replace(/^["“]|["”]$/g, "")
        .trim(),
    )
    .filter((line) => line !== "");
  return [...new Set(lines)].slice(0, MAX_SUGGESTIONS);
}

function failure(
  code: string,
  message: string,
): { ok: false; error: ProviderErrorInfo } {
  return { ok: false, error: { code, message } };
}
