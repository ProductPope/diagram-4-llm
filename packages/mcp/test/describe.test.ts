import { readClaudeCodeSession, type Result } from "@diagram-4-llm/core";
import { describe, expect, it } from "vitest";

import { describeSessionMap } from "../src/describe.js";

function unwrap<V>(result: Result<V, unknown>): V {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const prompt = (uuid: string, parentUuid: string | null, text: string) => ({
  type: "user",
  uuid,
  parentUuid,
  message: { content: text },
});
const answer = (uuid: string, parentUuid: string, text: string) => ({
  type: "assistant",
  uuid,
  parentUuid,
  message: { id: uuid, content: [{ type: "text", text }] },
});

describe("session outline", () => {
  it("keeps chains flat, indents branches and marks where each one starts", () => {
    const session = unwrap(
      readClaudeCodeSession(
        [
          prompt("p1", null, "Start"),
          answer("a1", "p1", "Started."),
          prompt("p2", "a1", "Left"),
          answer("a2", "p2", "Went left."),
          prompt("p3", "a1", "Right"),
          prompt("p4", null, "Another start"),
          { type: "attachment", uuid: "x1", parentUuid: "p4" },
        ]
          .map((line) => JSON.stringify(line))
          .join("\n"),
      ),
    );

    const lines = describeSessionMap("project/s.jsonl", session).split("\n");
    expect(lines.slice(2)).toEqual([
      "- p1 prompt: Start",
      "- a1 answer: Started.",
      "  - p2 prompt: Left",
      "  - a2 answer: Went left.",
      "  - p3 (after a1) prompt: Right",
      "- p4 (new start) prompt: Another start",
      "Lines not included, by type: attachment 1.",
    ]);
  });
});
