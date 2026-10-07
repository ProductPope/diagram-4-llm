import { describe, expect, it } from "vitest";

import {
  addSummary,
  addUserTurn,
  appendAssistantContent,
  childrenOf,
  createConversation,
  finishAssistantTurn,
  pathTo,
  renameConversation,
  setNodeMeta,
  startAssistantTurn,
  type ConversationGraph,
  type NodeId,
} from "../src/index.js";
import {
  answer,
  CREATED_AT,
  errorOf,
  newGraph,
  say,
  startAnswer,
  unwrap,
} from "./helpers.js";

function addUser(
  graph: ConversationGraph,
  id: NodeId,
  parentId: NodeId | null,
  refs: NodeId[] = [],
  content = "q",
) {
  return addUserTurn(graph, {
    id,
    createdAt: CREATED_AT,
    parentId,
    refs,
    content,
  });
}

/** U1 → A1 (complete), U1 → A-stream (streaming). */
function base() {
  let graph = newGraph();
  graph = say(graph, "U1", null, "question");
  graph = answer(graph, "A1", "U1", "answer");
  graph = startAnswer(graph, "A-stream", "U1");
  return graph;
}

describe("createConversation", () => {
  it("rejects a timestamp that is not ISO 8601 UTC", () => {
    const result = createConversation({
      id: "c",
      title: "t",
      createdAt: "yesterday",
    });
    expect(errorOf(result)).toMatchObject({ code: "invalid-conversation" });
  });
});

describe("addUserTurn", () => {
  it("rejects empty or whitespace-only content", () => {
    expect(errorOf(addUser(newGraph(), "U", null, [], "  \n"))).toEqual({
      code: "empty-content",
    });
  });

  it("rejects a duplicate id", () => {
    expect(errorOf(addUser(base(), "U1", null))).toEqual({
      code: "duplicate-id",
      id: "U1",
    });
  });

  it("rejects an unknown parent", () => {
    expect(errorOf(addUser(base(), "U", "nope"))).toEqual({
      code: "unknown-node",
      id: "nope",
    });
  });

  it("rejects a user turn as parent", () => {
    expect(errorOf(addUser(base(), "U", "U1"))).toEqual({
      code: "parent-not-assistant",
      parentId: "U1",
    });
  });

  it("rejects a parent that is still streaming", () => {
    expect(errorOf(addUser(base(), "U", "A-stream"))).toEqual({
      code: "parent-not-finished",
      parentId: "A-stream",
    });
  });

  it("rejects an aborted parent without content but accepts one with partial content", () => {
    let graph = base();
    graph = startAnswer(graph, "A-empty", "U1");
    graph = unwrap(
      finishAssistantTurn(graph, "A-empty", { status: "aborted" }),
    );
    expect(errorOf(addUser(graph, "U", "A-empty"))).toEqual({
      code: "parent-not-finished",
      parentId: "A-empty",
    });

    graph = unwrap(appendAssistantContent(graph, "A-stream", "partial"));
    graph = unwrap(
      finishAssistantTurn(graph, "A-stream", { status: "aborted" }),
    );
    expect(addUser(graph, "U", "A-stream").ok).toBe(true);
  });

  it("rejects a reference listed twice", () => {
    let graph = base();
    graph = say(graph, "U2", null, "other root");
    expect(errorOf(addUser(graph, "U", "A1", ["U2", "U2"]))).toEqual({
      code: "ref-duplicate",
      refId: "U2",
    });
  });

  it("rejects a reference to a node already on the path", () => {
    expect(errorOf(addUser(base(), "U", "A1", ["U1"]))).toEqual({
      code: "ref-on-path",
      refId: "U1",
    });
  });

  it("rejects a reference to an unfinished turn", () => {
    expect(errorOf(addUser(base(), "U", null, ["A-stream"]))).toEqual({
      code: "ref-not-finished",
      refId: "A-stream",
    });
  });

  it("does not modify the original graph", () => {
    const graph = base();
    const next = unwrap(addUser(graph, "U", "A1"));
    expect(graph.nodes.has("U")).toBe(false);
    expect(next.nodes.has("U")).toBe(true);
  });
});

describe("assistant turns", () => {
  it("rejects an assistant turn as parent", () => {
    const result = startAssistantTurn(base(), {
      id: "A",
      createdAt: CREATED_AT,
      parentId: "A1",
      adapter: "anthropic",
      model: "m",
      params: {},
      systemPrompt: null,
    });
    expect(errorOf(result)).toEqual({
      code: "parent-not-user",
      parentId: "A1",
    });
  });

  it("records the context manifest when the turn starts", () => {
    let graph = base();
    graph = say(graph, "U2", "A1", "follow-up");
    graph = startAnswer(graph, "A2", "U2");
    const turn = graph.nodes.get("A2");
    expect(
      turn?.kind === "assistant" && turn.generation.manifest.entries,
    ).toEqual([
      { nodeId: "U1", via: "path" },
      { nodeId: "A1", via: "path" },
      { nodeId: "U2", via: "path" },
    ]);
  });

  it("accumulates streamed content and keeps it when the provider fails", () => {
    let graph = base();
    graph = unwrap(appendAssistantContent(graph, "A-stream", "Hel"));
    graph = unwrap(appendAssistantContent(graph, "A-stream", "lo"));
    graph = unwrap(
      finishAssistantTurn(graph, "A-stream", {
        status: "error",
        error: { code: "overloaded", message: "Try again later" },
        usage: { inputTokens: 10, outputTokens: 2 },
      }),
    );
    expect(graph.nodes.get("A-stream")).toMatchObject({
      status: "error",
      content: "Hello",
      error: { code: "overloaded" },
      generation: { usage: { inputTokens: 10, outputTokens: 2 } },
    });
  });

  it("records why a complete answer ended", () => {
    const graph = unwrap(
      finishAssistantTurn(base(), "A-stream", {
        status: "complete",
        stopReason: "max-tokens",
      }),
    );
    expect(graph.nodes.get("A-stream")).toMatchObject({
      status: "complete",
      stopReason: "max-tokens",
    });
    expect(graph.nodes.get("A-stream")).not.toHaveProperty("error");
  });

  it("rejects changes to a turn that is not streaming", () => {
    expect(errorOf(appendAssistantContent(base(), "A1", "more"))).toEqual({
      code: "not-streaming",
      id: "A1",
    });
    expect(
      errorOf(
        finishAssistantTurn(base(), "U1", {
          status: "complete",
          stopReason: "end",
        }),
      ),
    ).toEqual({
      code: "not-streaming",
      id: "U1",
    });
  });

  it("rejects usage values outside the data format", () => {
    const result = finishAssistantTurn(base(), "A-stream", {
      status: "complete",
      stopReason: "end",
      usage: { inputTokens: -1, outputTokens: 0 },
    });
    expect(errorOf(result)).toMatchObject({ code: "invalid-node" });
  });

  it("keeps creation order when a streaming turn is updated", () => {
    let graph = base();
    graph = say(graph, "U2", null, "later");
    graph = unwrap(appendAssistantContent(graph, "A-stream", "x"));
    expect([...graph.nodes.keys()]).toEqual(["U1", "A1", "A-stream", "U2"]);
  });
});

describe("addSummary", () => {
  const summary = (
    fromId: NodeId,
    toId: NodeId,
    extra: { revises?: NodeId } = {},
  ) => ({
    id: `S-${fromId}-${toId}-${extra.revises ?? ""}`,
    createdAt: CREATED_AT,
    covers: { fromId, toId },
    content: "summary",
    ...extra,
  });

  it("rejects a range whose start is not an ancestor of its end", () => {
    let graph = base();
    graph = say(graph, "U2", null, "other root");
    expect(errorOf(addSummary(graph, summary("U2", "A1")))).toEqual({
      code: "summary-range",
      fromId: "U2",
      toId: "A1",
    });
  });

  it("rejects summarising an unfinished turn", () => {
    expect(errorOf(addSummary(base(), summary("U1", "A-stream")))).toEqual({
      code: "summary-not-finished",
      toId: "A-stream",
    });
  });

  it("rejects a revision of a summary with a different range", () => {
    let graph = base();
    graph = unwrap(addSummary(graph, { ...summary("U1", "A1"), id: "S" }));
    expect(
      errorOf(addSummary(graph, summary("A1", "A1", { revises: "S" }))),
    ).toEqual({
      code: "revision-mismatch",
      revisesId: "S",
    });
  });

  it("rejects a summary as a range endpoint", () => {
    let graph = base();
    graph = unwrap(addSummary(graph, { ...summary("U1", "A1"), id: "S" }));
    expect(errorOf(addSummary(graph, summary("S", "A1")))).toEqual({
      code: "not-a-turn",
      id: "S",
    });
  });
});

describe("queries", () => {
  it("lists children in creation order and roots for null", () => {
    let graph = base();
    graph = say(graph, "U2", null, "second root");
    expect(childrenOf(graph, "U1").map((n) => n.id)).toEqual([
      "A1",
      "A-stream",
    ]);
    expect(childrenOf(graph, null).map((n) => n.id)).toEqual(["U1", "U2"]);
  });

  it("returns the path root first", () => {
    let graph = base();
    graph = say(graph, "U2", "A1", "follow-up");
    expect(unwrap(pathTo(graph, "U2")).map((n) => n.id)).toEqual([
      "U1",
      "A1",
      "U2",
    ]);
  });

  it("rejects a path to a summary", () => {
    let graph = base();
    graph = unwrap(
      addSummary(graph, {
        id: "S",
        createdAt: CREATED_AT,
        covers: { fromId: "U1", toId: "A1" },
        content: "s",
      }),
    );
    expect(errorOf(pathTo(graph, "S"))).toEqual({
      code: "not-a-turn",
      id: "S",
    });
  });
});

describe("setNodeMeta", () => {
  it("stores presentation state for an existing node only", () => {
    const graph = unwrap(
      setNodeMeta(base(), "U1", { title: "Intro", collapsed: true }),
    );
    expect(graph.meta.get("U1")).toEqual({ title: "Intro", collapsed: true });
    expect(errorOf(setNodeMeta(base(), "nope", {}))).toEqual({
      code: "unknown-node",
      id: "nope",
    });
  });
});

describe("renameConversation", () => {
  it("changes the title and nothing else, without changing the input", () => {
    const original = say(newGraph(), "u1", null, "Hello");
    const renamed = renameConversation(original, "Trip planning");

    expect(renamed.conversation).toEqual({
      ...original.conversation,
      title: "Trip planning",
    });
    expect(renamed.nodes).toBe(original.nodes);
    expect(renamed.meta).toBe(original.meta);
    expect(original.conversation.title).not.toBe("Trip planning");
  });
});
