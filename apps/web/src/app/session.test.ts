import type { SessionStep } from "@diagram-4-llm/core";
import { describe, expect, it } from "vitest";

import {
  describeNotShown,
  describeProblems,
  describeSessionError,
  stepLabel,
  stepRole,
} from "./session";

const prompt = (id: string, parentId: string | null, text: string) =>
  ({ kind: "prompt", id, parentId, text, timestamp: null }) as const;

const work: SessionStep = {
  kind: "activity",
  id: "a1",
  parentId: "p1",
  model: "claude-test",
  timestamp: null,
  items: [
    { kind: "tool", name: "Bash", input: "{}", result: null },
    { kind: "text", text: "Done.\nAll good." },
    { kind: "tool", name: "Read", input: "{}", result: null },
  ],
};

describe("session map helpers", () => {
  it("labels a step by its last text, or by its tool calls", () => {
    expect(stepLabel(work)).toBe("Done. All good.");
    expect(stepRole(work)).toBe("claude-test · 2 tool calls");
    const toolsOnly: SessionStep = {
      ...work,
      model: null,
      items: [{ kind: "tool", name: "Bash", input: "{}", result: null }],
    };
    expect(stepLabel(toolsOnly)).toBe("1 tool call");
    expect(stepRole(toolsOnly)).toBe("Claude · 1 tool call");
    expect(stepLabel(prompt("p", null, "x".repeat(60)))).toBe(
      `${"x".repeat(47)}…`,
    );
  });

  it("describes what the map leaves out, largest first", () => {
    expect(describeNotShown(new Map())).toBeNull();
    expect(
      describeNotShown(
        new Map([
          ["system", 2],
          ["attachment", 1412],
        ]),
      ),
    ).toBe("Lines not on the map, by type: attachment 1,412, system 2.");
  });

  it("describes lines that could not be read", () => {
    expect(describeProblems([])).toBeNull();
    expect(describeProblems([{ line: 3, message: "Not valid JSON" }])).toBe(
      "1 line could not be read and is not on the map. The first, line 3: Not valid JSON",
    );
    expect(
      describeProblems([
        { line: 3, message: "Not valid JSON" },
        { line: 9, message: "The line has no type." },
      ]),
    ).toMatch(
      /^2 lines could not be read and are not on the map\. The first, line 3/,
    );
  });

  it("explains why a file could not be read", () => {
    expect(describeSessionError({ code: "empty" })).toBe("The file is empty.");
    expect(
      describeSessionError({
        code: "no-steps",
        problems: [{ line: 1, message: "The line has no type." }],
      }),
    ).toBe(
      "The file is not a Claude Code session transcript: line 1: The line has no type.",
    );
  });
});
