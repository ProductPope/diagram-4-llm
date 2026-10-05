import type {
  AssistantTurn,
  ConversationGraph,
  NodeId,
  TurnNode,
} from "@diagram-4-llm/core";

import { siblingsOf } from "../app/branch";

interface Props {
  readonly graph: ConversationGraph;
  readonly branch: readonly TurnNode[];
  readonly busy: boolean;
  readonly onSelect: (anchor: NodeId) => void;
  readonly onEdit: (turn: TurnNode) => void;
  readonly onRegenerate: (userTurnId: NodeId) => void;
}

/**
 * The selected branch as a linear transcript. Content is rendered as plain
 * text: model output is untrusted, so no HTML from it ever reaches the page.
 */
export function ReadingPane({
  graph,
  branch,
  busy,
  onSelect,
  onEdit,
  onRegenerate,
}: Props) {
  if (branch.length === 0) {
    return <p className="empty">Start the conversation below.</p>;
  }
  return (
    <ol className="transcript" aria-label="Selected branch">
      {branch.map((turn) => {
        const { siblings, index } = siblingsOf(graph, turn);
        const label = turn.kind === "user" ? "You" : turn.generation.model;
        return (
          <li
            key={turn.id}
            className={`turn turn-${turn.kind}`}
            aria-label={turn.kind === "user" ? "Your message" : "Answer"}
          >
            <header className="turn-header">
              <span className="turn-author">{label}</span>
              {siblings.length > 1 && (
                <span className="versions">
                  <button
                    type="button"
                    aria-label="Previous version"
                    disabled={busy || index === 0}
                    onClick={() => {
                      const previous = siblings[index - 1];
                      if (previous !== undefined) onSelect(previous.id);
                    }}
                  >
                    ‹
                  </button>
                  <span aria-label="Version">
                    {index + 1} / {siblings.length}
                  </span>
                  <button
                    type="button"
                    aria-label="Next version"
                    disabled={busy || index === siblings.length - 1}
                    onClick={() => {
                      const next = siblings[index + 1];
                      if (next !== undefined) onSelect(next.id);
                    }}
                  >
                    ›
                  </button>
                </span>
              )}
              {!busy && turn.kind === "user" && (
                <button
                  type="button"
                  onClick={() => {
                    onEdit(turn);
                  }}
                >
                  Edit
                </button>
              )}
              {!busy && turn.kind === "assistant" && (
                <button
                  type="button"
                  onClick={() => {
                    onRegenerate(turn.parentId);
                  }}
                >
                  Regenerate
                </button>
              )}
            </header>
            <div className="turn-content">{turn.content}</div>
            {turn.kind === "assistant" && <AnswerStatus turn={turn} />}
          </li>
        );
      })}
    </ol>
  );
}

function AnswerStatus({ turn }: { readonly turn: AssistantTurn }) {
  const text = statusText(turn);
  if (text === null) return null;
  return (
    <p
      className={`turn-status turn-status-${turn.status}`}
      role={turn.status === "error" ? "alert" : "status"}
    >
      {text}
    </p>
  );
}

function statusText(turn: AssistantTurn): string | null {
  switch (turn.status) {
    case "streaming":
      return "Generating…";
    case "aborted":
      return "Stopped before the answer was complete.";
    case "error":
      return `Failed: ${turn.error?.message ?? "unknown error"}`;
    case "complete":
      if (turn.stopReason === "max-tokens")
        return "Cut off by the output or context limit.";
      if (turn.stopReason === "refusal") return "The model declined to answer.";
      return null;
  }
}
