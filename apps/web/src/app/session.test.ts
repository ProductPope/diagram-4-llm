import type { SessionStep } from "@diagram-4-llm/core";
import { describe, expect, it } from "vitest";

import {
  describeListProblems,
  describeSize,
  describeExportError,
  describeExportProblems,
  describeHiddenContent,
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

  it("describes entries of Claude Code's folder that could not be listed", () => {
    expect(describeListProblems([])).toBeNull();
    expect(describeListProblems(["a: denied", "b: denied"])).toBe(
      "2 entries of Claude Code's folder could not be read; the sessions in it may be missing from the list. The first: a: denied",
    );
  });

  it("describes file sizes in bytes, kilobytes or megabytes", () => {
    expect(describeSize(900)).toBe("900 bytes");
    expect(describeSize(1536)).toBe("2 KB");
    expect(describeSize(5 * 1024 * 1024 + 100_000)).toBe("5.1 MB");
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

  it("describes what a Claude.ai conversation leaves out", () => {
    expect(describeHiddenContent(new Map())).toBeNull();
    expect(
      describeHiddenContent(
        new Map([
          ["empty answer", 1],
          ["thinking", 1200],
        ]),
      ),
    ).toBe("Content not on the map, by kind: thinking 1,200, empty answer 1.");
  });

  it("describes the parts of an export that could not be read", () => {
    expect(describeExportProblems([])).toBeNull();
    expect(describeExportProblems(["A", "B"])).toBe(
      "2 parts of the export could not be read and are not shown. The first: A",
    );
    expect(describeExportError({ code: "not-an-export" })).toBe(
      "The file is not the conversations.json of a Claude.ai data export.",
    );
    expect(
      describeExportError({ code: "no-conversations", problems: ["A"] }),
    ).toBe("No conversation in the export could be read. The first problem: A");
  });
});
