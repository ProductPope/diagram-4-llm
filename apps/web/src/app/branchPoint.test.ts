import {
  addUserTurn,
  appendAssistantContent,
  createConversation,
  finishAssistantTurn,
  startAssistantTurn,
  type ConversationGraph,
  type NodeId,
  type Result,
  type TurnNode,
} from "@diagram-4-llm/core";
import { describe, expect, it } from "vitest";

import { branchPoint } from "./branchPoint";

const T = "2026-01-01T00:00:00.000Z";

function unwrap<V>(result: Result<V, unknown>): V {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

function answer(
  graph: ConversationGraph,
  id: NodeId,
  parentId: NodeId,
  finished: boolean,
): ConversationGraph {
  let next = unwrap(
    startAssistantTurn(graph, {
      id,
      parentId,
      createdAt: T,
      adapter: "anthropic",
      model: "m",
      params: {},
      systemPrompt: null,
    }),
  );
  next = unwrap(appendAssistantContent(next, id, `Answer ${id}`));
  return finished
    ? unwrap(
        finishAssistantTurn(next, id, {
          status: "complete",
          stopReason: "end",
        }),
      )
    : next;
}

// q → { a1 (finished), a2 (finished), a3 (still streaming) }
function graph(): ConversationGraph {
  let g = unwrap(createConversation({ id: "c", title: "t", createdAt: T }));
  g = unwrap(
    addUserTurn(g, {
      id: "q",
      parentId: null,
      refs: [],
      content: "Q",
      createdAt: T,
    }),
  );
  g = answer(g, "a1", "q", true);
  g = answer(g, "a2", "q", true);
  return answer(g, "a3", "q", false);
}

function turn(g: ConversationGraph, id: NodeId): TurnNode {
  const node = g.nodes.get(id);
  if (node === undefined || node.kind === "summary") throw new Error(id);
  return node;
}

describe("branchPoint", () => {
  it("branches from a finished answer itself", () => {
    const g = graph();
    expect(branchPoint(g, turn(g, "a1"), new Set())).toBe("a1");
  });

  it("does not branch from an unfinished answer", () => {
    const g = graph();
    expect(branchPoint(g, turn(g, "a3"), new Set())).toBeUndefined();
  });

  it("branches from a question after the answer on the selected branch", () => {
    const g = graph();
    expect(branchPoint(g, turn(g, "q"), new Set(["q", "a1"]))).toBe("a1");
  });

  it("otherwise after the newest finished answer to the question", () => {
    const g = graph();
    expect(branchPoint(g, turn(g, "q"), new Set())).toBe("a2");
  });

  it("does not branch from a question without a finished answer", () => {
    let g = unwrap(createConversation({ id: "c", title: "t", createdAt: T }));
    g = unwrap(
      addUserTurn(g, {
        id: "q",
        parentId: null,
        refs: [],
        content: "Q",
        createdAt: T,
      }),
    );
    g = answer(g, "a", "q", false);
    expect(branchPoint(g, turn(g, "q"), new Set())).toBeUndefined();
  });
});
