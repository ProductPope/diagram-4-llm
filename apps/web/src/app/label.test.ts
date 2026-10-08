import {
  addSummary,
  addUserTurn,
  createConversation,
  finishAssistantTurn,
  startAssistantTurn,
  type ConversationGraph,
  type TurnNode,
} from "@diagram-4-llm/core";
import { describe, expect, it } from "vitest";

import { labelOf } from "./label";

const T = "2026-01-01T00:00:00.000Z";

function unwrap<T>(
  result: { ok: true; value: T } | { ok: false; error: unknown },
): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

function turn(graph: ConversationGraph, id: string): TurnNode {
  const node = graph.nodes.get(id);
  if (node === undefined || node.kind === "summary")
    throw new Error(`no turn ${id}`);
  return node;
}

function userTurn(content: string): TurnNode {
  const graph = unwrap(
    addUserTurn(
      unwrap(createConversation({ id: "c", title: "t", createdAt: T })),
      { id: "u", createdAt: T, parentId: null, refs: [], content },
    ),
  );
  return turn(graph, "u");
}

/** An answer to "q" with no content yet, finished if `aborted`. */
function emptyAnswer(aborted: boolean): TurnNode {
  let graph = unwrap(
    addUserTurn(
      unwrap(createConversation({ id: "c", title: "t", createdAt: T })),
      { id: "u", createdAt: T, parentId: null, refs: [], content: "q" },
    ),
  );
  graph = unwrap(
    startAssistantTurn(graph, {
      id: "a",
      createdAt: T,
      parentId: "u",
      adapter: "anthropic",
      model: "m",
      params: {},
      systemPrompt: null,
    }),
  );
  if (aborted)
    graph = unwrap(finishAssistantTurn(graph, "a", { status: "aborted" }));
  return turn(graph, "a");
}

describe("labelOf", () => {
  it("shows a short message on one line", () => {
    expect(labelOf(userTurn("  Which\n\ndatabase?  "))).toBe("Which database?");
  });

  it("cuts a long message to 48 characters", () => {
    const label = labelOf(userTurn("x".repeat(60)));
    expect(label).toHaveLength(48);
    expect(label.endsWith("…")).toBe(true);
  });

  it("shows an answer still waiting for its first words as in progress", () => {
    expect(labelOf(emptyAnswer(false))).toBe("…");
  });

  it("marks an answer that ended without content", () => {
    expect(labelOf(emptyAnswer(true))).toBe("(empty)");
  });

  it("shows the start of a summary", () => {
    const graph = unwrap(
      addSummary(
        unwrap(
          addUserTurn(
            unwrap(createConversation({ id: "c", title: "t", createdAt: T })),
            { id: "u", createdAt: T, parentId: null, refs: [], content: "q" },
          ),
        ),
        {
          id: "s",
          createdAt: T,
          covers: { fromId: "u", toId: "u" },
          content: "The user asked\nabout q.",
        },
      ),
    );
    const summary = graph.nodes.get("s");
    if (summary === undefined) throw new Error("no summary");
    expect(labelOf(summary)).toBe("The user asked about q.");
  });
});
