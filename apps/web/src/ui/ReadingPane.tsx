import type {
  AssistantTurn,
  ConversationGraph,
  NodeId,
  SummaryNode,
  TurnNode,
  UserTurn,
} from "@diagram-4-llm/core";
import { isUsable } from "@diagram-4-llm/core";

import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import { cn } from "#lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Paperclip,
  Pencil,
  RotateCcw,
  ScrollText,
} from "lucide-react";

import { useEffect, useRef, useState } from "react";

import { siblingsOf } from "../app/branch";
import { labelOf } from "../app/label";
import { currentSummaries } from "../app/summaries";
import { MarkdownContent } from "./MarkdownContent";
import { SummaryCard } from "./SummaryCard";

interface Props {
  readonly graph: ConversationGraph;
  readonly branch: readonly TurnNode[];
  readonly busy: boolean;
  readonly onSelect: (anchor: NodeId) => void;
  /** Shows a turn's branch and scrolls to the turn, as the map does. */
  readonly onShowTurn: (id: NodeId) => void;
  readonly onEdit: (turn: TurnNode) => void;
  readonly onRegenerate: (userTurnId: NodeId) => void;
  /** Summarises the branch up to an answer; absent without a provider. */
  readonly onSummarise: ((answerId: NodeId) => void) | undefined;
  /** The summary being written, shown after the turn it ends at. */
  readonly pendingSummary: {
    readonly toId: NodeId;
    readonly text: string;
  } | null;
  readonly onReviseSummary: (summary: SummaryNode, content: string) => void;
  /** Nodes attached to the message being written. */
  readonly attached: readonly NodeId[];
  readonly onToggleReference: (id: NodeId) => void;
  /**
   * A turn chosen elsewhere, such as on the map, to scroll into view. A new
   * request scrolls again even if it names the same turn.
   */
  readonly reveal: { readonly id: NodeId; readonly request: number } | null;
  /**
   * Called with the turns that are on screen whenever that changes. The
   * pane only watches its turns while this is given.
   */
  readonly onTurnsInView?: ((ids: ReadonlySet<NodeId>) => void) | undefined;
}

/** How long a revealed turn stays highlighted. */
const HIGHLIGHT_MS = 1500;

/**
 * The selected branch as a linear transcript. Answers are rendered as
 * Markdown without raw HTML; the user's own messages as plain text.
 */
export function ReadingPane({
  graph,
  branch,
  busy,
  onSelect,
  onShowTurn,
  onEdit,
  onRegenerate,
  onSummarise,
  pendingSummary,
  onReviseSummary,
  attached,
  onToggleReference,
  reveal,
  onTurnsInView,
}: Props) {
  const list = useRef<HTMLOListElement>(null);
  const [highlighted, setHighlighted] = useState<NodeId | null>(null);

  useEffect(() => {
    if (reveal === null) return;
    const element = list.current?.querySelector(
      `[data-turn-id="${reveal.id}"]`,
    );
    if (element === null || element === undefined) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    element.scrollIntoView({
      block: "start",
      behavior: reduceMotion ? "auto" : "smooth",
    });
    setHighlighted(reveal.id);
    const timer = setTimeout(() => {
      setHighlighted(null);
    }, HIGHLIGHT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [reveal]);

  // The observer reads the turns from the DOM, so it is set up again when
  // the branch shows other turns.
  const turnIds = branch.map((turn) => turn.id).join(" ");
  useEffect(() => {
    const element = list.current;
    if (onTurnsInView === undefined || element === null) return;
    const inView = new Set<NodeId>();
    // Clipping by the scrolling conversation counts, so a turn scrolled
    // out of the pane is not in view even while it is inside the window.
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = entry.target.getAttribute("data-turn-id");
        if (id === null) continue;
        if (entry.isIntersecting) inView.add(id);
        else inView.delete(id);
      }
      onTurnsInView(new Set(inView));
    });
    for (const turn of element.querySelectorAll("[data-turn-id]"))
      observer.observe(turn);
    return () => {
      observer.disconnect();
    };
  }, [turnIds, onTurnsInView]);

  if (branch.length === 0) {
    return (
      <p className="m-auto text-sm text-muted-foreground">
        Start the conversation below.
      </p>
    );
  }
  const summaries = currentSummaries(graph);
  const rootId = branch[0]?.id;
  return (
    <ol ref={list} className="flex flex-col gap-5" aria-label="Selected branch">
      {branch.map((turn) => {
        const { siblings, index } = siblingsOf(graph, turn);
        return (
          <li
            key={turn.id}
            data-turn-id={turn.id}
            className={cn(
              "group/turn -mx-2 flex scroll-mt-4 flex-col gap-2 rounded-xl px-2 py-1 transition-colors duration-500",
              turn.kind === "user" && "items-end",
              highlighted === turn.id && "bg-branch/10",
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
              {!busy &&
                turn.kind === "assistant" &&
                isUsable(turn) &&
                onSummarise !== undefined && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      onSummarise(turn.id);
                    }}
                  >
                    <ScrollText aria-hidden="true" />
                    Summarise
                  </Button>
                )}
            </header>
            {turn.kind === "assistant" ? (
              <div className="w-full">
                <MarkdownContent text={turn.content} />
              </div>
            ) : (
              <>
                <References
                  graph={graph}
                  turn={turn}
                  busy={busy}
                  onShowTurn={onShowTurn}
                />
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-muted px-4 py-2.5 text-sm whitespace-pre-wrap break-words">
                  {turn.content}
                </div>
              </>
            )}
            {turn.kind === "assistant" && <AnswerStatus turn={turn} />}
            {summaries.get(turn.id)?.map((summary) => (
              <SummaryCard
                key={summary.id}
                summary={summary}
                fromRoot={summary.covers.fromId === rootId}
                attached={attached.includes(summary.id)}
                busy={busy}
                onToggleReference={() => {
                  onToggleReference(summary.id);
                }}
                onRevise={(content) => {
                  onReviseSummary(summary, content);
                }}
              />
            ))}
            {pendingSummary?.toId === turn.id && (
              <section
                className="flex flex-col gap-2 rounded-xl border border-dashed px-4 py-3"
                aria-label="Summary being written"
              >
                <p className="text-xs text-muted-foreground" role="status">
                  Summarising the branch up to here…
                </p>
                <MarkdownContent text={pendingSummary.text} />
              </section>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * What the user attached to a message, in the order it was sent. A turn
 * can be opened in its own branch; a summary is not part of any branch.
 */
function References({
  graph,
  turn,
  busy,
  onShowTurn,
}: {
  readonly graph: ConversationGraph;
  readonly turn: UserTurn;
  readonly busy: boolean;
  readonly onShowTurn: (id: NodeId) => void;
}) {
  if (turn.refs.length === 0) return null;
  return (
    <ul
      className="flex max-w-[85%] flex-wrap justify-end gap-1.5 text-xs"
      aria-label="Attached"
    >
      {turn.refs.map((id) => {
        const node = graph.nodes.get(id);
        if (node === undefined) return null;
        const label = graph.meta.get(id)?.title ?? labelOf(node);
        const content = (
          <>
            <Paperclip aria-hidden="true" />
            <span className="truncate">
              {node.kind === "user"
                ? "You: "
                : node.kind === "summary"
                  ? "Summary: "
                  : ""}
              {label}
            </span>
          </>
        );
        return (
          <li key={id} className="min-w-0">
            {node.kind === "summary" ? (
              <span className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-muted-foreground [&_svg]:size-3">
                {content}
              </span>
            ) : (
              <Button
                variant="outline"
                size="xs"
                className="max-w-full font-normal"
                disabled={busy}
                title="Show in its branch"
                onClick={() => {
                  onShowTurn(id);
                }}
              >
                {content}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
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
