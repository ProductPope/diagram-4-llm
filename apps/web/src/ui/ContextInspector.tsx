import { Badge } from "#components/ui/badge";
import {
  assembleContext,
  describeGraphError,
  type ContextDraft,
  type ConversationGraph,
} from "@diagram-4-llm/core";
import { ChevronRight } from "lucide-react";

interface Props {
  readonly graph: ConversationGraph;
  readonly draft: ContextDraft;
  readonly systemPrompt: string | null;
}

/** Shows exactly what would be sent to the model if the draft were sent now. */
export function ContextInspector({ graph, draft, systemPrompt }: Props) {
  if (draft.content.trim() === "") {
    return (
      <p className="text-xs text-muted-foreground">
        The exact context appears here once you type a message.
      </p>
    );
  }
  const assembled = assembleContext(graph, draft, { systemPrompt });
  if (!assembled.ok) {
    return (
      <p className="text-xs text-destructive">
        Cannot build the context: {describeGraphError(assembled.error)}
      </p>
    );
  }
  const { system, messages, manifest } = assembled.value;
  return (
    <details className="inspector group text-xs">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-md text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-3.5 transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
        Context: {messages.length}{" "}
        {messages.length === 1 ? "message" : "messages"}, about{" "}
        {manifest.estimatedInputTokens} tokens (estimate)
      </summary>
      <div className="mt-2 flex max-h-72 flex-col gap-2 overflow-y-auto rounded-lg border bg-muted/40 p-3">
        {system !== null && (
          <section className="flex flex-col gap-1">
            <h3>
              <Badge variant="outline">System</Badge>
            </h3>
            <pre className="font-sans whitespace-pre-wrap">{system}</pre>
          </section>
        )}
        <ol className="flex flex-col gap-2">
          {messages.map((message, i) => (
            <li key={i} className="flex flex-col gap-1">
              <h3>
                <Badge variant="outline">
                  {message.role === "user" ? "User" : "Assistant"}
                </Badge>
              </h3>
              <pre className="font-sans whitespace-pre-wrap">
                {message.content}
              </pre>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
