import type {
  AssistantTurn,
  ConversationGraph,
  NodeId,
  TurnNode,
} from "@diagram-4-llm/core";

import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import { cn } from "#lib/utils";
import { ChevronLeft, ChevronRight, Pencil, RotateCcw } from "lucide-react";

import { siblingsOf } from "../app/branch";
import { MarkdownContent } from "./MarkdownContent";

interface Props {
  readonly graph: ConversationGraph;
  readonly branch: readonly TurnNode[];
  readonly busy: boolean;
  readonly onSelect: (anchor: NodeId) => void;
  readonly onEdit: (turn: TurnNode) => void;
  readonly onRegenerate: (userTurnId: NodeId) => void;
}

/**
 * The selected branch as a linear transcript. Answers are rendered as
 * Markdown without raw HTML; the user's own messages as plain text.
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
    return (
      <p className="m-auto text-sm text-muted-foreground">
        Start the conversation below.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-5" aria-label="Selected branch">
      {branch.map((turn) => {
        const { siblings, index } = siblingsOf(graph, turn);
        return (
          <li
            key={turn.id}
            className={cn(
              "group/turn flex flex-col gap-2",
              turn.kind === "user" && "items-end",
            )}
            aria-label={turn.kind === "user" ? "Your message" : "Answer"}
          >
            <header className="flex min-h-7 items-center gap-1 text-xs text-muted-foreground">
              {turn.kind === "user" ? (
                <span className="font-medium">You</span>
              ) : (
                <Badge variant="outline" className="font-mono font-normal">
                  {turn.generation.model}
                </Badge>
              )}
              {siblings.length > 1 && (
                <span className="flex items-center">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Previous version"
                    disabled={busy || index === 0}
                    onClick={() => {
                      const previous = siblings[index - 1];
                      if (previous !== undefined) onSelect(previous.id);
                    }}
                  >
                    <ChevronLeft aria-hidden="true" />
                  </Button>
                  <span aria-label="Version" className="tabular-nums">
                    {index + 1} / {siblings.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Next version"
                    disabled={busy || index === siblings.length - 1}
                    onClick={() => {
                      const next = siblings[index + 1];
                      if (next !== undefined) onSelect(next.id);
                    }}
                  >
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </span>
              )}
              {!busy && turn.kind === "user" && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    onEdit(turn);
                  }}
                >
                  <Pencil aria-hidden="true" />
                  Edit
                </Button>
              )}
              {!busy && turn.kind === "assistant" && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    onRegenerate(turn.parentId);
                  }}
                >
                  <RotateCcw aria-hidden="true" />
                  Regenerate
                </Button>
              )}
            </header>
            {turn.kind === "assistant" ? (
              <div className="w-full">
                <MarkdownContent text={turn.content} />
              </div>
            ) : (
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-muted px-4 py-2.5 text-sm whitespace-pre-wrap break-words">
                {turn.content}
              </div>
            )}
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
      className={cn(
        "text-xs",
        turn.status === "error" ? "text-destructive" : "text-muted-foreground",
      )}
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
