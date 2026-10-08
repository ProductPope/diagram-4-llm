import type { ConversationGraph, NodeId, TurnNode } from "@diagram-4-llm/core";
import { Button } from "#components/ui/button";
import { cn } from "#lib/utils";
import { PanelRightOpen } from "lucide-react";
import { useEffect, useRef, type Ref } from "react";

import { labelOf } from "../app/label";

interface Props {
  readonly graph: ConversationGraph | null;
  readonly branch: readonly TurnNode[];
  /** The turns of the branch that are visible in the reading pane. */
  readonly inView: ReadonlySet<NodeId>;
  readonly onReveal: (id: NodeId) => void;
  readonly onRestore: () => void;
  readonly restoreRef: Ref<HTMLButtonElement>;
}

/**
 * The map minimized to a strip beside the conversation: one marker per turn
 * of the selected branch, in reading order, with the turns on screen
 * highlighted. Activating a marker scrolls the conversation to its turn.
 * Questions are drawn on the right and answers across the strip, as they
 * are laid out in the reading pane.
 */
export function BranchStrip({
  graph,
  branch,
  inView,
  onReveal,
  onRestore,
  restoreRef,
}: Props) {
  const list = useRef<HTMLOListElement>(null);
  const firstInView = branch.find((turn) => inView.has(turn.id))?.id;

  // A long branch scrolls inside the strip; keep the part being read in it.
  // The strip's own scroll position is set rather than calling
  // scrollIntoView, which would also scroll the panels around it.
  useEffect(() => {
    const element = list.current;
    if (element === null || firstInView === undefined) return;
    const marker = element.querySelector<HTMLElement>(
      `[data-turn-id="${firstInView}"]`,
    );
    if (marker === null) return;
    const top = marker.offsetTop;
    const bottom = top + marker.offsetHeight;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (bottom > element.scrollTop + element.clientHeight)
      element.scrollTop = bottom - element.clientHeight;
  }, [firstInView]);

  return (
    <nav
      className="flex h-full w-12 shrink-0 flex-col items-center gap-2 border-l bg-muted/40 py-2"
      aria-label="Branch outline"
    >
      <Button
        ref={restoreRef}
        variant="outline"
        size="icon"
        aria-label="Show the map"
        title="Show the map"
        onClick={onRestore}
      >
        <PanelRightOpen aria-hidden="true" />
      </Button>
      <ol
        ref={list}
        className="relative flex min-h-0 w-full flex-1 flex-col overflow-y-auto px-1.5"
      >
        {branch.map((turn) => {
          const label = graph?.meta.get(turn.id)?.title ?? labelOf(turn);
          const name = `${turn.kind === "user" ? "Your message" : "Answer"}: ${label}`;
          const failed = turn.kind === "assistant" && turn.status === "error";
          return (
            <li key={turn.id} className="flex">
              <button
                type="button"
                data-turn-id={turn.id}
                className="flex h-6 w-full items-center rounded-md px-1 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                aria-label={name}
                aria-current={turn.id === firstInView ? "location" : undefined}
                title={name}
                onClick={() => {
                  onReveal(turn.id);
                }}
              >
                <span
                  className={cn(
                    "h-1.5 rounded-full",
                    turn.kind === "user" ? "ml-auto w-1/2" : "w-full",
                    failed
                      ? "bg-destructive"
                      : inView.has(turn.id)
                        ? "bg-branch"
                        : "bg-muted-foreground/40",
                  )}
                />
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
