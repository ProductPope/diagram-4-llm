import type { TurnNode } from "@diagram-4-llm/core";

/** The start of a turn's message on one line, for a turn without a title. */
export function labelOf(turn: TurnNode): string {
  const text = turn.content.trim().replace(/\s+/g, " ");
  if (text === "")
    return turn.kind === "assistant" && turn.status === "streaming"
      ? "…"
      : "(empty)";
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}
