import {
  assembleContext,
  describeGraphError,
  type ContextDraft,
  type ConversationGraph,
} from "@diagram-4-llm/core";

interface Props {
  readonly graph: ConversationGraph;
  readonly draft: ContextDraft;
  readonly systemPrompt: string | null;
}

/** Shows exactly what would be sent to the model if the draft were sent now. */
export function ContextInspector({ graph, draft, systemPrompt }: Props) {
  if (draft.content.trim() === "") {
    return (
      <p className="inspector-hint">
        The exact context appears here once you type a message.
      </p>
    );
  }
  const assembled = assembleContext(graph, draft, { systemPrompt });
  if (!assembled.ok) {
    return (
      <p className="inspector-error">
        Cannot build the context: {describeGraphError(assembled.error)}
      </p>
    );
  }
  const { system, messages, manifest } = assembled.value;
  return (
    <details className="inspector">
      <summary>
        Context: {messages.length}{" "}
        {messages.length === 1 ? "message" : "messages"}, about{" "}
        {manifest.estimatedInputTokens} tokens (estimate)
      </summary>
      {system !== null && (
        <section>
          <h3>System</h3>
          <pre>{system}</pre>
        </section>
      )}
      <ol>
        {messages.map((message, i) => (
          <li key={i}>
            <h3>{message.role}</h3>
            <pre>{message.content}</pre>
          </li>
        ))}
      </ol>
    </details>
  );
}
