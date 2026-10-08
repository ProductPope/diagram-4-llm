import { childrenOf, type AssistantTurn } from "@diagram-4-llm/core";
import { describe, expect, it } from "vitest";

import { visibleBranch } from "./branch";
import { DEMO_MODEL, demoConversation } from "./demo";
import { parseConversationFile, serializeConversation } from "./transfer";

function demo() {
  const built = demoConversation();
  if (!built.ok) throw new Error(JSON.stringify(built.error));
  return built.value;
}

describe("demoConversation", () => {
  it("survives export and import unchanged, like any conversation", () => {
    const graph = demo();
    const parsed = parseConversationFile(serializeConversation(graph));
    expect(parsed).toEqual({ ok: true, value: graph });
  });

  it("forks the first answer into three topics", () => {
    const topics = childrenOf(demo(), "demo-a1").map((turn) => turn.content);
    expect(topics).toHaveLength(3);
    expect(topics.join(" ")).toMatch(/scope[\s\S]*worked[\s\S]*rollout/);
  });

  it("forks again inside a topic", () => {
    expect(childrenOf(demo(), "demo-a2-rollout")).toHaveLength(2);
  });

  it("has two versions of one answer", () => {
    expect(childrenOf(demo(), "demo-q2-scope")).toHaveLength(2);
  });

  it("opens on the deepest branch", () => {
    expect(visibleBranch(demo(), null).map((turn) => turn.id)).toEqual([
      "demo-q1",
      "demo-a1",
      "demo-q2-rollout",
      "demo-a2-rollout",
      "demo-q3-invite",
      "demo-a3-invite",
      "demo-q4-invite",
      "demo-a4-invite",
    ]);
  });

  it("labels every answer as written by hand and gives it a title", () => {
    const graph = demo();
    const answers = [...graph.nodes.values()].filter(
      (node): node is AssistantTurn => node.kind === "assistant",
    );
    expect(answers.length).toBeGreaterThan(0);
    for (const answer of answers) {
      expect(answer.generation.model).toBe(DEMO_MODEL);
      expect(answer.status).toBe("complete");
      expect(graph.meta.get(answer.id)?.title).toMatch(/\S/);
    }
  });
});
