import type { NodeId } from "@diagram-4-llm/core";

import { Alert, AlertDescription } from "#components/ui/alert";
import { Button } from "#components/ui/button";
import { GitMerge, Gauge, X } from "lucide-react";

import type { ContextBudget } from "../app/budget";

/** How many of the largest attachments are offered for removal. */
const LISTED_REFERENCES = 3;

interface Props {
  readonly budget: ContextBudget;
  readonly model: string;
  /** Attached nodes, largest first, with a label for each. */
  readonly references: readonly {
    readonly id: NodeId;
    readonly tokens: number;
    readonly label: string;
  }[];
  readonly onRemoveReference: (id: NodeId) => void;
  /**
   * Continues in a new first message with a summary of the branch attached
   * instead of the branch; absent when the message continues no branch or
   * no model is configured.
   */
  readonly onContinueFromSummary: (() => void) | undefined;
}

/**
 * Warns when the context of the message being written comes close to the
 * model's context window, and explains why sending is blocked when it is
 * larger. It suggests what the user can do; the app never shortens the
 * context itself.
 */
export function BudgetNotice({
  budget,
  model,
  references,
  onRemoveReference,
  onContinueFromSummary,
}: Props) {
  if (budget.status === "unknown" || budget.status === "ok") return null;
  const over = budget.status === "over";
  const suggestions = references.slice(0, LISTED_REFERENCES);
  return (
    <Alert variant={over ? "destructive" : "default"}>
      <Gauge aria-hidden="true" />
      <AlertDescription className="flex flex-col gap-2">
        <p>
          {over
            ? `The context is about ${format(budget.estimated)} tokens, more than the ${format(budget.window)}-token context window of ${model}. Nothing is cut off, so it cannot be sent as it is.`
            : `The context is about ${format(budget.estimated)} of the ${format(budget.window)} tokens ${model} can read, leaving little room for the answer.`}{" "}
          The count is an estimate.
        </p>
        {(onContinueFromSummary !== undefined || suggestions.length > 0) && (
          <ul
            className="flex flex-wrap gap-2"
            aria-label="Ways to make the context smaller"
          >
            {onContinueFromSummary !== undefined && (
              <li>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={onContinueFromSummary}
                >
                  <GitMerge aria-hidden="true" />
                  Continue from a summary of this branch
                </Button>
              </li>
            )}
            {suggestions.map((reference) => (
              <li key={reference.id}>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    onRemoveReference(reference.id);
                  }}
                >
                  <X aria-hidden="true" />
                  Remove “{reference.label}” (about {format(reference.tokens)}{" "}
                  tokens)
                </Button>
              </li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}

function format(tokens: number): string {
  return tokens.toLocaleString("en");
}
