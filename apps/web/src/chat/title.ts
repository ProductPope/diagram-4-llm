import {
  describeGraphError,
  setNodeMeta,
  type ConversationGraph,
  type NodeId,
  type ProviderErrorInfo,
  type Result,
} from "@diagram-4-llm/core";

import type { ProviderAdapter } from "../providers/types";
import type { Store } from "./store";

const INSTRUCTION =
  "You write titles for the messages of a conversation. Reply with a title " +
  "of at most six words that says what the message is about. Reply with " +
  "the title only, without quotes or a full stop.";
/** Room for a short title, plus a little for models that pad their reply. */
const MAX_OUTPUT_TOKENS = 64;
const MAX_TITLE_LENGTH = 80;

/**
 * Asks `model` for a short title of a finished answer and stores it as the
 * answer's presentation title. The request contains only the answer, with
 * no conversation context, and is never recorded in the conversation.
 * Resolves with `null`, not an error, when there is nothing to title (the
 * answer is unfinished) or the user stopped the request.
 */
export async function titleAnswer(
  graph: Store<ConversationGraph>,
  answerId: NodeId,
  adapter: ProviderAdapter,
  model: string,
  signal: AbortSignal,
): Promise<Result<string | null, ProviderErrorInfo>> {
  const answer = graph.get().nodes.get(answerId);
  if (answer === undefined)
    return failure("unknown-node", `No turn with ID ${answerId}.`);
  if (answer.kind !== "assistant" || answer.status !== "complete")
    return { ok: true, value: null };

  let text = "";
  for await (const event of adapter.stream(
    {
      model,
      context: {
        system: INSTRUCTION,
        messages: [{ role: "user", content: answer.content }],
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

  const title = cleanTitle(text);
  if (title === "")
    return failure("empty-title", "The model replied with an empty title.");

  // Applied to the latest graph: the conversation may have changed meanwhile.
  const latest = graph.get();
  const updated = setNodeMeta(latest, answerId, {
    ...latest.meta.get(answerId),
    title,
  });
  if (!updated.ok) return failure("graph", describeGraphError(updated.error));
  graph.set(updated.value);
  return { ok: true, value: title };
}

/**
 * Models often wrap a title in quotes or Markdown, or end it with a full
 * stop, despite the instruction. Keeps the first line without them.
 */
export function cleanTitle(reply: string): string {
  const firstLine =
    reply
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line !== "") ?? "";
  const bare = firstLine
    .replace(/^(?:#+\s*|title:\s*)/i, "")
    .replace(/^["'“”*_`]+|["'“”*_`.]+$/g, "")
    .trim();
  return bare.length > MAX_TITLE_LENGTH
    ? `${bare.slice(0, MAX_TITLE_LENGTH - 1)}…`
    : bare;
}

function failure(
  code: string,
  message: string,
): { ok: false; error: ProviderErrorInfo } {
  return { ok: false, error: { code, message } };
}
