import {
  addSummary,
  addUserTurn,
  createConversation,
  type ConversationGraph,
  type NewSummary,
  type Result,
} from "@diagram-4-llm/core";
import { describe, expect, it } from "vitest";

import { currentSummaries } from "./summaries";

const T = "2026-01-01T00:00:00.000Z";

function unwrap<V>(result: Result<V, unknown>): V {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

// Two roots, so that summaries can end at different turns.
function graph(): ConversationGraph {
  let g = unwrap(createConversation({ id: "c", title: "t", createdAt: T }));
  for (const id of ["u1", "u2"])
    g = unwrap(
      addUserTurn(g, {
        id,
        parentId: null,
        refs: [],
        content: id,
        createdAt: T,
      }),
    );
  return g;
}

function summarise(
  g: ConversationGraph,
  summary: Omit<NewSummary, "createdAt">,
): ConversationGraph {
  return unwrap(addSummary(g, { ...summary, createdAt: T }));
}

function ids(map: ReturnType<typeof currentSummaries>, toId: string) {
  return map.get(toId)?.map((summary) => summary.id);
}

describe("currentSummaries", () => {
  it("groups summaries by the turn they end at, in creation order", () => {
    let g = graph();
    g = summarise(g, {
      id: "s1",
      covers: { fromId: "u1", toId: "u1" },
      content: "a",
    });
    g = summarise(g, {
      id: "s2",
      covers: { fromId: "u2", toId: "u2" },
      content: "b",
    });
    g = summarise(g, {
      id: "s3",
      covers: { fromId: "u1", toId: "u1" },
      content: "c",
    });
    const current = currentSummaries(g);
    expect(ids(current, "u1")).toEqual(["s1", "s3"]);
    expect(ids(current, "u2")).toEqual(["s2"]);
  });

  it("shows only the latest revision of an edited summary", () => {
    let g = graph();
    g = summarise(g, {
      id: "s1",
      covers: { fromId: "u1", toId: "u1" },
      content: "a",
    });
    g = summarise(g, {
      id: "s2",
      covers: { fromId: "u1", toId: "u1" },
      content: "a, edited",
      revises: "s1",
    });
    g = summarise(g, {
      id: "s3",
      covers: { fromId: "u1", toId: "u1" },
      content: "a, edited twice",
      revises: "s2",
    });
    expect(ids(currentSummaries(g), "u1")).toEqual(["s3"]);
  });

  it("has nothing for a conversation without summaries", () => {
    expect(currentSummaries(graph()).size).toBe(0);
  });
});
