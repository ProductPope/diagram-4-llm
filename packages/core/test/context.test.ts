import { describe, expect, it } from "vitest";

import {
  assembleContext,
  assembleForSummary,
  assembleForUserTurn,
  estimateTokens,
} from "../src/index.js";
import {
  answer,
  errorOf,
  newGraph,
  say,
  startAnswer,
  unwrap,
} from "./helpers.js";

describe("assembleContext", () => {
  it("alternates roles along the path and ends with the draft", () => {
    let graph = newGraph();
    graph = say(graph, "U1", null, "first");
    graph = answer(graph, "A1", "U1", "reply");
    const context = unwrap(
      assembleContext(
        graph,
        { parentId: "A1", refs: [], content: "second" },
        { systemPrompt: null },
      ),
    );
    expect(context.messages).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "reply" },
      { role: "user", content: "second" },
    ]);
  });

  it("keeps references of earlier turns in later context, in their original position", () => {
    let graph = newGraph();
    graph = say(graph, "X", null, "side question");
    graph = answer(graph, "AX", "X", "side answer");
    graph = say(graph, "U1", null, "main question", ["AX"]);
    graph = answer(graph, "A1", "U1", "main answer");
    const context = unwrap(
      assembleContext(
        graph,
        { parentId: "A1", refs: [], content: "next" },
        { systemPrompt: null },
      ),
    );
    expect(context.manifest.entries).toEqual([
      { nodeId: "AX", via: "ref" },
      { nodeId: "U1", via: "path" },
      { nodeId: "A1", via: "path" },
    ]);
    expect(context.messages[0]?.content).toBe(
      '<context source="assistant" node="AX">\nside answer\n</context>\n\nmain question',
    );
  });

  it("passes the system prompt through and counts it in the estimate", () => {
    const context = unwrap(
      assembleContext(
        newGraph(),
        { parentId: null, refs: [], content: "abcd" },
        { systemPrompt: "12345678" },
      ),
    );
    expect(context.system).toBe("12345678");
    expect(context.manifest.estimatedInputTokens).toBe(
      estimateTokens("12345678") + estimateTokens("abcd"),
    );
  });

  it("rejects a draft that would violate the graph rules", () => {
    expect(
      errorOf(
        assembleContext(
          newGraph(),
          { parentId: null, refs: [], content: "" },
          { systemPrompt: null },
        ),
      ),
    ).toEqual({
      code: "empty-content",
    });
  });
});

describe("assembleForUserTurn", () => {
  it("produces the same messages as the draft that created the turn", () => {
    let graph = newGraph();
    graph = say(graph, "U1", null, "first");
    graph = answer(graph, "A1", "U1", "reply");
    const draft = unwrap(
      assembleContext(
        graph,
        { parentId: "A1", refs: [], content: "second" },
        { systemPrompt: "s" },
      ),
    );
    graph = say(graph, "U2", "A1", "second");
    const existing = unwrap(
      assembleForUserTurn(graph, "U2", { systemPrompt: "s" }),
    );
    expect(existing.messages).toEqual(draft.messages);
    expect(existing.manifest.estimatedInputTokens).toBe(
      draft.manifest.estimatedInputTokens,
    );
  });
});

describe("assembleForUserTurn errors", () => {
  it("rejects an id that is not a user turn", () => {
    let graph = newGraph();
    graph = say(graph, "U1", null, "first");
    graph = answer(graph, "A1", "U1", "reply");
    expect(
      errorOf(assembleForUserTurn(graph, "A1", { systemPrompt: null })),
    ).toEqual({
      code: "not-a-user-turn",
      id: "A1",
    });
  });
});

describe("estimateTokens", () => {
  it("rounds up to whole tokens", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("assembleForSummary", () => {
  function conversation() {
    let graph = newGraph();
    graph = say(graph, "X", null, "side question");
    graph = answer(graph, "AX", "X", "side answer");
    graph = say(graph, "U1", null, "first");
    graph = answer(graph, "A1", "U1", "reply one");
    graph = say(graph, "U2", "A1", "second", ["AX"]);
    return answer(graph, "A2", "U2", "reply two");
  }

  it("sends the segment as one transcript, turns in order", () => {
    const context = unwrap(
      assembleForSummary(
        conversation(),
        { fromId: "U1", toId: "A1" },
        { systemPrompt: "Summarise." },
      ),
    );
    expect(context.system).toBe("Summarise.");
    expect(context.messages).toEqual([
      {
        role: "user",
        content:
          '<turn role="user">\nfirst\n</turn>\n\n<turn role="assistant">\nreply one\n</turn>',
      },
    ]);
    expect(context.manifest.entries).toEqual([
      { nodeId: "U1", via: "path" },
      { nodeId: "A1", via: "path" },
    ]);
  });

  it("can start with an answer and keeps the references of its turns", () => {
    const context = unwrap(
      assembleForSummary(
        conversation(),
        { fromId: "A1", toId: "A2" },
        { systemPrompt: null },
      ),
    );
    expect(context.messages).toEqual([
      {
        role: "user",
        content:
          '<turn role="assistant">\nreply one\n</turn>\n\n' +
          '<turn role="user">\n<context source="assistant" node="AX">\nside answer\n</context>\n\nsecond\n</turn>\n\n' +
          '<turn role="assistant">\nreply two\n</turn>',
      },
    ]);
    expect(context.manifest.entries).toEqual([
      { nodeId: "A1", via: "path" },
      { nodeId: "AX", via: "ref" },
      { nodeId: "U2", via: "path" },
      { nodeId: "A2", via: "path" },
    ]);
  });

  it("estimates the system prompt and the transcript", () => {
    const context = unwrap(
      assembleForSummary(
        conversation(),
        { fromId: "U1", toId: "U1" },
        { systemPrompt: "12345678" },
      ),
    );
    const transcript = context.messages[0]?.content ?? "";
    expect(context.manifest.estimatedInputTokens).toBe(
      2 + estimateTokens(transcript),
    );
  });

  it("rejects a range whose start is not on the path to its end", () => {
    expect(
      errorOf(
        assembleForSummary(
          conversation(),
          { fromId: "X", toId: "A2" },
          { systemPrompt: null },
        ),
      ),
    ).toEqual({ code: "summary-range", fromId: "X", toId: "A2" });
  });

  it("rejects a range that ends in an unfinished answer", () => {
    const graph = startAnswer(conversation(), "A3", "U2");
    expect(
      errorOf(
        assembleForSummary(
          graph,
          { fromId: "U1", toId: "A3" },
          { systemPrompt: null },
        ),
      ),
    ).toEqual({ code: "summary-not-finished", toId: "A3" });
  });
});
