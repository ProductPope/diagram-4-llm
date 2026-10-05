// Applies random sequences of operations, including invalid ones, and checks
// that the invariants in docs/ARCHITECTURE.md section 2.1 hold afterwards.
import fc from "fast-check";
import { expect, it } from "vitest";

import {
  addSummary,
  addUserTurn,
  appendAssistantContent,
  exportConversation,
  finishAssistantTurn,
  importConversation,
  isTurn,
  pathTo,
  startAssistantTurn,
  type ConversationGraph,
  type GraphNode,
  type NodeId,
  type Result,
} from "../src/index.js";
import { CREATED_AT, newGraph, unwrap } from "./helpers.js";

type Command =
  | {
      op: "user";
      parent: number | null;
      refs: readonly number[];
      content: string;
    }
  | { op: "start"; parent: number }
  | { op: "append"; target: number; text: string }
  | { op: "finish"; target: number; status: "complete" | "aborted" | "error" }
  | {
      op: "summary";
      from: number;
      to: number;
      revises: number | null;
      content: string;
    };

// Weighted towards inputs that are often valid, while still producing
// invalid ones (empty text, wrong parents, bad references) regularly.
const index = fc.nat(30);
const text = fc.oneof(
  { weight: 1, arbitrary: fc.constantFrom("", " ") },
  { weight: 5, arbitrary: fc.string({ minLength: 1, maxLength: 12 }) },
);
const parent = fc.oneof(fc.constant(null), index);
const refs = fc.oneof(
  { weight: 3, arbitrary: fc.constant([]) },
  { weight: 1, arbitrary: fc.array(index, { minLength: 1, maxLength: 2 }) },
);

const command: fc.Arbitrary<Command> = fc.oneof(
  fc.record({
    op: fc.constant("user" as const),
    parent,
    refs,
    content: text,
  }),
  fc.record({ op: fc.constant("start" as const), parent: index }),
  fc.record({ op: fc.constant("append" as const), target: index, text }),
  fc.record({
    op: fc.constant("finish" as const),
    target: index,
    status: fc.constantFrom(
      "complete" as const,
      "aborted" as const,
      "error" as const,
    ),
  }),
  fc.record({
    op: fc.constant("summary" as const),
    from: index,
    to: index,
    revises: fc.option(index, { nil: null }),
    content: text,
  }),
);

/**
 * Picks an existing node by position among the nodes of the given kinds, so
 * generated indices stay meaningful as the graph grows. Statuses are not
 * filtered: unfinished parents and references must still be rejected.
 */
function pick(
  graph: ConversationGraph,
  i: number,
  kinds: readonly GraphNode["kind"][],
): NodeId {
  const ids = [...graph.nodes.values()]
    .filter((n) => kinds.includes(n.kind))
    .map((n) => n.id);
  return ids[i % Math.max(ids.length, 1)] ?? "missing";
}

const ANY = ["user", "assistant", "summary"] as const;
const TURNS = ["user", "assistant"] as const;

function apply(
  graph: ConversationGraph,
  c: Command,
  id: NodeId,
): Result<ConversationGraph, unknown> {
  switch (c.op) {
    case "user":
      return addUserTurn(graph, {
        id,
        createdAt: CREATED_AT,
        parentId:
          c.parent === null ? null : pick(graph, c.parent, ["assistant"]),
        refs: c.refs.map((r) => pick(graph, r, ANY)),
        content: c.content,
      });
    case "start":
      return startAssistantTurn(graph, {
        id,
        createdAt: CREATED_AT,
        parentId: pick(graph, c.parent, ["user"]),
        adapter: "anthropic",
        model: "m",
        params: {},
        systemPrompt: null,
      });
    case "append":
      return appendAssistantContent(
        graph,
        pick(graph, c.target, ["assistant"]),
        c.text,
      );
    case "finish":
      return finishAssistantTurn(
        graph,
        pick(graph, c.target, ["assistant"]),
        c.status === "error"
          ? { status: "error", error: { code: "e", message: "" } }
          : { status: c.status },
      );
    case "summary": {
      // Usually an ancestor of `toId`, sometimes an arbitrary turn, so that
      // both valid and invalid ranges occur.
      const toId = pick(graph, c.to, TURNS);
      const path = pathTo(graph, toId);
      const ancestors = path.ok ? path.value : [];
      const fromId =
        c.from % 4 === 0 || ancestors.length === 0
          ? pick(graph, c.from, TURNS)
          : (ancestors[c.from % ancestors.length]?.id ?? toId);
      return addSummary(graph, {
        id,
        createdAt: CREATED_AT,
        covers: { fromId, toId },
        content: c.content,
        ...(c.revises === null
          ? {}
          : { revises: pick(graph, c.revises, ["summary"]) }),
      });
    }
  }
}

const accepted: Record<Command["op"], number> = {
  user: 0,
  start: 0,
  append: 0,
  finish: 0,
  summary: 0,
};

function run(commands: readonly Command[]): ConversationGraph {
  let graph = newGraph();
  commands.forEach((c, i) => {
    const result = apply(graph, c, `n${i}`);
    if (result.ok) {
      accepted[c.op] += 1;
      graph = result.value;
    }
  });
  return graph;
}

function checkInvariants(graph: ConversationGraph): void {
  const position = new Map([...graph.nodes.keys()].map((id, i) => [id, i]));
  const before = (target: NodeId, self: NodeId) =>
    (position.get(target) ?? Infinity) < (position.get(self) ?? -Infinity);

  for (const node of graph.nodes.values()) {
    if (node.kind === "summary") {
      expect(before(node.covers.toId, node.id)).toBe(true);
      expect(
        unwrap(pathTo(graph, node.covers.toId)).some(
          (n) => n.id === node.covers.fromId,
        ),
      ).toBe(true);
      continue;
    }
    if (node.parentId !== null)
      expect(before(node.parentId, node.id)).toBe(true);

    // Alternation: every path starts with a user turn and alternates roles.
    const path = unwrap(pathTo(graph, node.id));
    path.forEach((turn, i) => {
      expect(turn.kind).toBe(i % 2 === 0 ? "user" : "assistant");
    });

    if (node.kind === "user") {
      const pathIds = new Set(path.map((n) => n.id));
      expect(new Set(node.refs).size).toBe(node.refs.length);
      for (const ref of node.refs) {
        expect(before(ref, node.id)).toBe(true);
        expect(pathIds.has(ref)).toBe(false);
      }
    }
  }
  expect(
    [...graph.nodes.values()]
      .filter(isTurn)
      .every((n) => n.conversationId === graph.conversation.id),
  ).toBe(true);
}

it("keeps every invariant and survives export and import under random operations", () => {
  fc.assert(
    fc.property(
      fc.array(command, { minLength: 10, maxLength: 60, size: "max" }),
      (commands) => {
        const graph = run(commands);
        checkInvariants(graph);

        // Import re-validates every node, including recorded context manifests.
        const document = exportConversation(graph);
        const imported = unwrap(
          importConversation(JSON.parse(JSON.stringify(document))),
        );
        expect(exportConversation(imported)).toEqual(document);
      },
    ),
    { numRuns: 300 },
  );

  // Guards against a generator that only produces rejected operations,
  // which would make the property above pass without testing anything.
  // Typical counts are in the hundreds per operation; the threshold is far
  // below that so random seeds cannot make this check flaky.
  for (const [op, count] of Object.entries(accepted)) {
    expect(count, `accepted "${op}" operations`).toBeGreaterThan(20);
  }
});
