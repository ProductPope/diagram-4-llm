import {
  addUserTurn,
  appendAssistantContent,
  createConversation,
  finishAssistantTurn,
  startAssistantTurn,
  type ConversationGraph,
} from "@diagram-4-llm/core";
import { describe, expect, it } from "vitest";

import { siblingsOf, visibleBranch } from "./branch";

const T = "2026-01-01T00:00:00.000Z";

function unwrap<T>(
  result: { ok: true; value: T } | { ok: false; error: unknown },
): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

function say(
  graph: ConversationGraph,
  id: string,
  parentId: string | null,
): ConversationGraph {
  return unwrap(
    addUserTurn(graph, { id, createdAt: T, parentId, refs: [], content: id }),
  );
}

function answer(
  graph: ConversationGraph,
  id: string,
  parentId: string,
): ConversationGraph {
  let next = unwrap(
    startAssistantTurn(graph, {
      id,
      createdAt: T,
      parentId,
      adapter: "anthropic",
      model: "m",
      params: {},
      systemPrompt: null,
    }),
  );
  next = unwrap(appendAssistantContent(next, id, id));
  return unwrap(
    finishAssistantTurn(next, id, { status: "complete", stopReason: "end" }),
  );
}

/** u1 → a1 → { u2 → a2, u3 → a3 }, and a second root r2. */
function tree(): ConversationGraph {
  let g = unwrap(createConversation({ id: "c", title: "t", createdAt: T }));
  g = say(g, "u1", null);
  g = answer(g, "a1", "u1");
  g = say(g, "u2", "a1");
  g = answer(g, "a2", "u2");
  g = say(g, "u3", "a1");
  g = answer(g, "a3", "u3");
  g = say(g, "r2", null);
  return g;
}

const ids = (branch: readonly { id: string }[]) => branch.map((t) => t.id);

describe("visibleBranch", () => {
  it("starts at the newest root when there is no anchor", () => {
    expect(ids(visibleBranch(tree(), null))).toEqual(["r2"]);
  });

  it("continues past the anchor through the newest children", () => {
    expect(ids(visibleBranch(tree(), "u1"))).toEqual(["u1", "a1", "u3", "a3"]);
  });

  it("shows an older branch when its turn is the anchor", () => {
    expect(ids(visibleBranch(tree(), "u2"))).toEqual(["u1", "a1", "u2", "a2"]);
  });
});

describe("siblingsOf", () => {
  it("lists the turn with its siblings in creation order", () => {
    const g = tree();
    const u2 = g.nodes.get("u2");
    if (u2 === undefined || u2.kind === "summary")
      throw new Error("fixture changed");
    const { siblings, index } = siblingsOf(g, u2);
    expect(ids(siblings)).toEqual(["u2", "u3"]);
    expect(index).toBe(0);
  });
});
