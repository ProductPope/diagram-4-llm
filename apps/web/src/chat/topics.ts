import type { ProviderErrorInfo, Result } from "@diagram-4-llm/core";

import type { ProviderAdapter } from "../providers/types";

/** One prompt of a linear conversation, in order. */
export interface TopicItem {
  readonly id: string;
  readonly text: string;
}

/** A run of consecutive prompts about one subject. */
export interface Topic {
  readonly title: string;
  readonly itemIds: readonly string[];
}

const INSTRUCTION =
  "You divide a conversation into topics. You get the user's prompts in " +
  "order, numbered. Group consecutive prompts that are about the same " +
  "subject. Reply with one line per topic: the number of the prompt it " +
  "starts at, a colon, and a title of a few words in the language of the " +
  "conversation. The first topic starts at 1. Write nothing else.";
/** Room for a title line per topic in a long session. */
const MAX_OUTPUT_TOKENS = 1000;
/**
 * The start of each prompt is enough to tell its subject. Whole prompts can
 * hold pasted logs or files, which would make the request large without
 * changing the topics.
 */
const EXCERPT_LENGTH = 300;

/** The message that lists the prompts, as the model reads it. */
export function topicMessage(items: readonly TopicItem[]): string {
  return items
    .map((item, i) => `${String(i + 1)}. ${excerpt(item.text)}`)
    .join("\n");
}

/**
 * Asks `model` to divide the prompts into topics. The request holds only
 * the starts of the prompts, and nothing is saved: topics are shown while
 * the page is open. Resolves with `null` when the user stopped the request.
 */
export async function detectTopics(
  items: readonly TopicItem[],
  adapter: ProviderAdapter,
  model: string,
  signal: AbortSignal,
): Promise<Result<readonly Topic[] | null, ProviderErrorInfo>> {
  if (items.length === 0)
    return failure("no-prompts", "This branch has no prompts.");

  let text = "";
  for await (const event of adapter.stream(
    {
      model,
      context: {
        system: INSTRUCTION,
        messages: [{ role: "user", content: topicMessage(items) }],
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
  return parseTopics(text, items);
}

/**
 * Reads the model's reply. Lines that are not `<number>: <title>` are
 * skipped, since models sometimes add a heading despite the instruction.
 * The topics must start at the first prompt and move forward, so that they
 * cover every prompt once; a reply that does not is reported, not repaired.
 */
export function parseTopics(
  reply: string,
  items: readonly TopicItem[],
): Result<readonly Topic[], ProviderErrorInfo> {
  const starts: { readonly index: number; readonly title: string }[] = [];
  for (const line of reply.split("\n")) {
    const match = /^\s*(?:[-*•]\s*)?(\d+)\s*[:.)–-]\s*(.*\S)\s*$/.exec(line);
    if (match === null) continue;
    starts.push({
      index: Number(match[1]) - 1,
      title: (match[2] ?? "").replace(/^["“]|["”]$/g, ""),
    });
  }
  if (starts.length === 0)
    return failure("no-topics", "The model named no topics.");
  const inOrder = starts.every(
    (start, i) =>
      (i > 0 || start.index === 0) &&
      start.index > (starts[i - 1]?.index ?? -1) &&
      start.index < items.length,
  );
  if (!inOrder)
    return failure(
      "unordered-topics",
      "The model's topics do not start at the first prompt and follow the conversation in order.",
    );
  return {
    ok: true,
    value: starts.map((start, i) => ({
      title: start.title,
      itemIds: items
        .slice(start.index, starts[i + 1]?.index ?? items.length)
        .map((item) => item.id),
    })),
  };
}

function excerpt(text: string): string {
  const line = text.trim().replace(/\s+/g, " ");
  return line.length > EXCERPT_LENGTH
    ? `${line.slice(0, EXCERPT_LENGTH - 1)}…`
    : line;
}

function failure(
  code: string,
  message: string,
): { ok: false; error: ProviderErrorInfo } {
  return { ok: false, error: { code, message } };
}
