import {
  addUserTurn,
  appendAssistantContent,
  createConversation,
  exportConversation,
  finishAssistantTurn,
  startAssistantTurn,
  type ConversationDocument,
  type ConversationGraph,
  type NodeId,
} from "@diagram-4-llm/core";

const T = "2026-01-01T00:00:00.000Z";

function unwrap<T>(
  result: { ok: true; value: T } | { ok: false; error: unknown },
): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

/**
 * A conversation of `turns` turns (user and assistant) in which every fifth
 * answer is forked, so the tree has many branches of varying depth. The
 * shape is deterministic, so measurements are comparable between runs.
 */
export function largeConversation(turns: number): ConversationDocument {
  let graph: ConversationGraph = unwrap(
    createConversation({
      id: "large",
      title: "Large conversation",
      createdAt: T,
    }),
  );
  const answers: NodeId[] = [];
  let parent: NodeId | null = null;
  for (let i = 0; i < turns / 2; i++) {
    // Every fifth question forks from an earlier answer instead of the last one.
    if (i % 5 === 4 && answers.length > 0)
      parent = answers[(i * 7) % answers.length] ?? null;
    const user = `u${String(i)}`;
    const answer = `a${String(i)}`;
    graph = unwrap(
      addUserTurn(graph, {
        id: user,
        createdAt: T,
        parentId: parent,
        refs: [],
        content: `Question ${String(i)}`,
      }),
    );
    graph = unwrap(
      startAssistantTurn(graph, {
        id: answer,
        createdAt: T,
        parentId: user,
        adapter: "anthropic",
        model: "m",
        params: {},
        systemPrompt: null,
      }),
    );
    graph = unwrap(
      appendAssistantContent(
        graph,
        answer,
        `Answer ${String(i)} with **some** Markdown.`,
      ),
    );
    graph = unwrap(
      finishAssistantTurn(graph, answer, {
        status: "complete",
        stopReason: "end",
      }),
    );
    answers.push(answer);
    parent = answer;
  }
  return exportConversation(graph);
}
