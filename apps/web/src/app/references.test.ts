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

import {
  referenceChecker,
  referencesOnPath,
  toggleReference,
} from "./references";

const T = "2026-01-01T00:00:00.000Z";

function unwrap<V>(result: Result<V, unknown>): V {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

function ask(
  graph: ConversationGraph,
  id: NodeId,
  parentId: NodeId | null,
): ConversationGraph {
  return unwrap(
    addUserTurn(graph, {
      id,
      parentId,
      refs: [],
      content: `Question ${id}`,
      createdAt: T,
    }),
  );
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

// q1 → a1 → { q2 → a2, q3 → a3 (still streaming) }
function graph(): ConversationGraph {
  let g = unwrap(createConversation({ id: "c", title: "t", createdAt: T }));
  g = ask(g, "q1", null);
  g = answer(g, "a1", "q1", true);
  g = ask(g, "q2", "a1");
  g = answer(g, "a2", "q2", true);
  g = ask(g, "q3", "a1");
  return answer(g, "a3", "q3", false);
}

function turn(g: ConversationGraph, id: NodeId): TurnNode {
  const node = g.nodes.get(id);
  if (node === undefined || node.kind === "summary")
    throw new Error(`no turn ${id}`);
  return node;
}

describe("referenceChecker", () => {
  it("allows turns from another branch", () => {
    const g = graph();
    expect(referenceChecker(g, "a2")(turn(g, "q3"))).toBeNull();
    expect(referenceChecker(g, "a1")(turn(g, "a2"))).toBeNull();
  });

  it("allows any finished turn for a new root", () => {
    const g = graph();
    expect(referenceChecker(g, null)(turn(g, "q1"))).toBeNull();
    expect(referenceChecker(g, null)(turn(g, "a2"))).toBeNull();
  });

  it("rejects turns on the branch the message continues", () => {
    const g = graph();
    expect(referenceChecker(g, "a2")(turn(g, "q1"))).toBe("on-path");
    expect(referenceChecker(g, "a2")(turn(g, "a1"))).toBe("on-path");
    expect(referenceChecker(g, "a2")(turn(g, "a2"))).toBe("on-path");
  });

  it("rejects an answer that is not finished", () => {
    const g = graph();
    expect(referenceChecker(g, "a2")(turn(g, "a3"))).toBe("unfinished");
  });
});

describe("referencesOnPath", () => {
  it("finds attached turns that the chosen branch now contains", () => {
    const g = graph();
    // Attached while writing after a1, then a2's branch was chosen.
    expect(referencesOnPath(g, "a2", ["q3", "q2", "a1"])).toEqual(
      new Set(["q2", "a1"]),
    );
    expect(referencesOnPath(g, null, ["q2", "a1"])).toEqual(new Set());
  });
});

describe("toggleReference", () => {
  it("adds a turn at the end, keeping the order of attachment", () => {
    expect(toggleReference(["a", "b"], "c")).toEqual(["a", "b", "c"]);
  });

  it("removes a turn that is already attached", () => {
    expect(toggleReference(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});
