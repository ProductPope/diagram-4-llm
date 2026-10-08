import { Button } from "#components/ui/button";
import { GitFork, Send } from "lucide-react";
import { useId, useState } from "react";

interface Props {
  readonly suggestions: readonly string[];
  readonly busy: boolean;
  /** Puts a suggestion in the composer as a new branch, without sending it. */
  readonly onChoose: (text: string) => void;
  /** The estimated input tokens of sending each of `texts` as a branch. */
  readonly estimate: (texts: readonly string[]) => number;
  readonly onSendAll: (texts: readonly string[]) => void;
}

/**
 * Follow-up questions a model proposed for an answer. Choosing one starts a
 * branch from the answer with the question in the composer, so the user
 * can change it before sending. Several can be sent at once, each as its
 * own branch, but only after the combined cost has been shown.
 */
export function SuggestedBranches({
  suggestions,
  busy,
  onChoose,
  estimate,
  onSendAll,
}: Props) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [confirming, setConfirming] = useState(false);
  const heading = useId();
  const chosen = suggestions.filter((text) => selected.has(text));

  return (
    <section className="flex flex-col gap-2" aria-labelledby={heading}>
      <h3 id={heading} className="text-xs text-muted-foreground">
        Suggested branches
      </h3>
      <ul className="flex flex-col gap-1.5">
        {suggestions.map((text) => (
          <li key={text} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-primary"
              aria-label={`Select “${text}”`}
              checked={selected.has(text)}
              disabled={busy}
              onChange={(event) => {
                const next = new Set(selected);
                if (event.target.checked) next.add(text);
                else next.delete(text);
                setSelected(next);
                setConfirming(false);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-auto min-w-0 justify-start py-1 text-left font-normal whitespace-normal"
              disabled={busy}
              onClick={() => {
                onChoose(text);
              }}
            >
              <GitFork aria-hidden="true" />
              {text}
            </Button>
          </li>
        ))}
      </ul>
      {chosen.length > 1 &&
        (confirming ? (
          <div
            className="flex flex-wrap items-center gap-2 text-xs"
            role="group"
            aria-label="Confirm sending"
          >
            <p>
              Sends {chosen.length} messages, each as its own branch from this
              answer: about {estimate(chosen).toLocaleString("en")} input tokens
              in total (estimate).
            </p>
            <Button
              size="xs"
              disabled={busy}
              onClick={() => {
                onSendAll(chosen);
                setSelected(new Set());
                setConfirming(false);
              }}
            >
              <Send aria-hidden="true" />
              Send {chosen.length} messages
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setConfirming(false);
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="xs"
            className="self-start"
            disabled={busy}
            onClick={() => {
              setConfirming(true);
            }}
          >
            Send {chosen.length} selected as branches…
          </Button>
        ))}
    </section>
  );
}
