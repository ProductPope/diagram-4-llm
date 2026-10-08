import {
  addUserTurn,
  createConversation,
  type ConversationGraph,
  type Result,
} from "@diagram-4-llm/core";
import { describe, expect, it } from "vitest";

import { contextBudget, referencesBySize } from "./budget";

const T = "2026-01-01T00:00:00.000Z";

function unwrap<V>(result: Result<V, unknown>): V {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

describe("contextBudget", () => {
  it("is unknown without a context window", () => {
    expect(contextBudget(1_000_000, undefined)).toEqual({ status: "unknown" });
  });

  it("is within budget below 80% of the window", () => {
    expect(contextBudget(799, 1000)).toEqual({
      status: "ok",
      estimated: 799,
      window: 1000,
    });
  });

  it("warns from 80% of the window up to the window itself", () => {
    expect(contextBudget(800, 1000).status).toBe("near");
    expect(contextBudget(1000, 1000).status).toBe("near");
  });

  it("is over budget above the window", () => {
    expect(contextBudget(1001, 1000)).toEqual({
      status: "over",
      estimated: 1001,
      window: 1000,
    });
  });
});

describe("referencesBySize", () => {
  it("lists attached nodes largest first, with their estimates", () => {
    let graph: ConversationGraph = unwrap(
      createConversation({ id: "c", title: "t", createdAt: T }),
    );
    for (const [id, content] of [
      ["small", "abcd"],
      ["large", "x".repeat(40)],
      ["medium", "x".repeat(20)],
    ] as const)
      graph = unwrap(
        addUserTurn(graph, {
          id,
          parentId: null,
          refs: [],
          content,
          createdAt: T,
        }),
      );

    expect(referencesBySize(graph, ["small", "large", "medium"])).toEqual([
      { id: "large", tokens: 10 },
      { id: "medium", tokens: 5 },
      { id: "small", tokens: 1 },
    ]);
  });
});
