// The reference scenarios from docs/PLAN.md section 8.
import { describe, expect, it } from "vitest";

import { addSummary, assembleContext, estimateTokens } from "../src/index.js";
import { answer, CREATED_AT, newGraph, say, unwrap } from "./helpers.js";

/** R → A1, then two forks at A1: PostgreSQL (U2 → A2) and SQLite (U3 → A3). */
function databaseConversation() {
  let graph = newGraph();
  graph = say(graph, "R", null, "Which database should I use for my app?");
  graph = answer(graph, "A1", "R", "It depends on scale and deployment.");
  graph = say(graph, "U2", "A1", "Tell me more about PostgreSQL.");
  graph = answer(graph, "A2", "U2", "PostgreSQL is a server database.");
  graph = say(graph, "U3", "A1", "Tell me more about SQLite.");
  graph = answer(graph, "A3", "U3", "SQLite is an embedded database.");
  return graph;
}

describe("reference scenarios", () => {
  it("1. fork: a branch's context excludes sibling branches", () => {
    const graph = databaseConversation();
    const context = unwrap(
      assembleContext(
        graph,
        {
          parentId: "A3",
          refs: [],
          content: "Does it support concurrent writes?",
        },
        { systemPrompt: null },
      ),
    );

    expect(context.manifest.entries.map((e) => e.nodeId)).toEqual([
      "R",
      "A1",
      "U3",
      "A3",
    ]);
    expect(context.messages.map((m) => m.content).join("\n")).not.toContain(
      "PostgreSQL",
    );
  });

  it("2. edit and resend: a rewritten first message is a new root and the original branch is unchanged", () => {
    const before = databaseConversation();
    const after = say(
      before,
      "R2",
      null,
      "Which embedded database should I use?",
    );

    expect(after.nodes.get("R")).toBe(before.nodes.get("R"));
    expect(after.nodes.size).toBe(before.nodes.size + 1);
    const context = unwrap(
      assembleContext(
        after,
        { parentId: null, refs: [], content: "x" },
        { systemPrompt: null },
      ),
    );
    expect(context.manifest.entries).toEqual([]);
  });

  it("3. cherry-pick: a referenced answer is included without its own branch", () => {
    const graph = databaseConversation();
    const context = unwrap(
      assembleContext(
        graph,
        { parentId: "A3", refs: ["A2"], content: "How does this compare?" },
        { systemPrompt: null },
      ),
    );

    expect(context.manifest.entries).toEqual([
      { nodeId: "R", via: "path" },
      { nodeId: "A1", via: "path" },
      { nodeId: "U3", via: "path" },
      { nodeId: "A3", via: "path" },
      { nodeId: "A2", via: "ref" },
    ]);
    const last = context.messages.at(-1);
    expect(last?.content).toBe(
      '<context source="assistant" node="A2">\nPostgreSQL is a server database.\n</context>\n\nHow does this compare?',
    );
    expect(context.messages.map((m) => m.content).join("\n")).not.toContain(
      "Tell me more about PostgreSQL.",
    );
  });

  it("4. summarise and merge: a new root sees only the two summaries and the question", () => {
    let graph = databaseConversation();
    graph = unwrap(
      addSummary(graph, {
        id: "S2",
        createdAt: CREATED_AT,
        covers: { fromId: "U2", toId: "A2" },
        content: "PostgreSQL: server, strong concurrency.",
      }),
    );
    graph = unwrap(
      addSummary(graph, {
        id: "S2-edited",
        createdAt: CREATED_AT,
        covers: { fromId: "U2", toId: "A2" },
        content: "PostgreSQL: needs a server, handles concurrent writes well.",
        revises: "S2",
      }),
    );
    graph = unwrap(
      addSummary(graph, {
        id: "S3",
        createdAt: CREATED_AT,
        covers: { fromId: "U3", toId: "A3" },
        content: "SQLite: embedded, single writer.",
      }),
    );

    const context = unwrap(
      assembleContext(
        graph,
        {
          parentId: null,
          refs: ["S2-edited", "S3"],
          content: "Which one fits a desktop app?",
        },
        { systemPrompt: null },
      ),
    );

    expect(context.manifest.entries).toEqual([
      { nodeId: "S2-edited", via: "ref" },
      { nodeId: "S3", via: "ref" },
    ]);
    expect(context.messages).toHaveLength(1);
  });

  it("5. over budget: the assembler reports the size and never truncates", () => {
    let graph = newGraph();
    const long = "x".repeat(40_000);
    graph = say(graph, "U1", null, long);
    graph = answer(graph, "A1", "U1", long);

    const context = unwrap(
      assembleContext(
        graph,
        { parentId: "A1", refs: [], content: long },
        { systemPrompt: null },
      ),
    );

    expect(context.manifest.estimatedInputTokens).toBe(
      3 * estimateTokens(long),
    );
    expect(context.messages.map((m) => m.content)).toEqual([long, long, long]);
  });
});
