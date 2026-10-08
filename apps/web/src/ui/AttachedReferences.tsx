import type { ConversationGraph, NodeId } from "@diagram-4-llm/core";

import { Button } from "#components/ui/button";
import { cn } from "#lib/utils";
import { Paperclip, X } from "lucide-react";
import { useId } from "react";

import { labelOf } from "../app/label";

interface Props {
  readonly graph: ConversationGraph;
  readonly refs: readonly NodeId[];
  /** Attached turns that are already on the branch being continued. */
  readonly onPath: ReadonlySet<NodeId>;
  readonly onRemove: (id: NodeId) => void;
}

/**
 * The turns attached to the message being written, in the order they are
 * sent. A turn that has become part of the branch since it was attached,
 * because another branch was chosen, is marked; sending is blocked until it
 * is removed, so nothing is left out without the user knowing.
 */
export function AttachedReferences({ graph, refs, onPath, onRemove }: Props) {
  const heading = useId();
  if (refs.length === 0) return null;
  return (
    <section
      className="flex flex-col gap-1.5 text-xs"
      aria-labelledby={heading}
    >
      <h3 id={heading} className="text-muted-foreground">
        Attached to your message
      </h3>
      <ul className="flex flex-wrap gap-1.5">
        {refs.map((id) => {
          const node = graph.nodes.get(id);
          const label =
            node === undefined
              ? id
              : (graph.meta.get(id)?.title ?? labelOf(node));
          return (
            <li
              key={id}
              className={cn(
                "flex max-w-full items-center gap-1 rounded-md border bg-muted py-0.5 pr-0.5 pl-2",
                onPath.has(id) && "border-destructive",
              )}
            >
              <Paperclip className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {node?.kind === "user" ? "You: " : ""}
                {label}
              </span>
              {onPath.has(id) && (
                <span className="shrink-0 text-destructive">
                  (already in this branch)
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove “${label}”`}
                title="Remove"
                onClick={() => {
                  onRemove(id);
                }}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
