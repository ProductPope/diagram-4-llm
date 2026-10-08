import type { SummaryNode } from "@diagram-4-llm/core";

import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import { Textarea } from "#components/ui/textarea";
import { Paperclip, Pencil } from "lucide-react";
import { useId, useState } from "react";

import { MarkdownContent } from "./MarkdownContent";

interface Props {
  readonly summary: SummaryNode;
  /** Whether the range starts at the first message of the conversation. */
  readonly fromRoot: boolean;
  readonly attached: boolean;
  readonly busy: boolean;
  readonly onToggleReference: () => void;
  /** Saves an edit as a new revision; the summary itself never changes. */
  readonly onRevise: (content: string) => void;
}

/**
 * A summary of the branch up to the turn it follows. Generated summaries
 * are model output and rendered as Markdown without raw HTML; edited ones
 * are shown the same way, since the edit usually starts from that output.
 */
export function SummaryCard({
  summary,
  fromRoot,
  attached,
  busy,
  onToggleReference,
  onRevise,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const heading = useId();
  const editor = useId();

  return (
    <section
      className="flex flex-col gap-2 rounded-xl border border-dashed px-4 py-3"
      aria-labelledby={heading}
    >
      <header className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <h3 id={heading} className="font-medium">
          {fromRoot
            ? "Summary of the branch up to here"
            : "Summary of part of the branch"}
        </h3>
        {summary.generation === undefined ? (
          <span>· written by you</span>
        ) : (
          <Badge variant="outline" className="font-mono font-normal">
            {summary.generation.model}
          </Badge>
        )}
        {draft === null && (
          <span className="ml-auto flex items-center gap-1">
            <Button
              variant={attached ? "secondary" : "ghost"}
              size="xs"
              aria-pressed={attached}
              onClick={onToggleReference}
            >
              <Paperclip aria-hidden="true" />
              Attach to your message
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={() => {
                setDraft(summary.content);
              }}
            >
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          </span>
        )}
      </header>
      {draft === null ? (
        <MarkdownContent text={summary.content} />
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim() === "") return;
            onRevise(draft);
            setDraft(null);
          }}
        >
          <label htmlFor={editor} className="sr-only">
            Summary
          </label>
          <Textarea
            id={editor}
            autoFocus
            className="max-h-80 min-h-32 text-sm"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Saving keeps this version and adds yours after it.
          </p>
          <span className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={draft.trim() === ""}>
              Save summary
            </Button>
          </span>
        </form>
      )}
    </section>
  );
}
