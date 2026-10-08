// The lines below copy the shape of a transcript written by Claude Code
// 2.1.294, with the fields the reader ignores left out.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  readClaudeCodeSession,
  type ClaudeCodeSession,
  type SessionStep,
} from "../src/index.js";
import { errorOf, unwrap } from "./helpers.js";

const TIME = "2026-10-08T13:45:02.216Z";

function prompt(uuid: string, parentUuid: string | null, text: string) {
  return {
    type: "user",
    uuid,
    parentUuid,
    timestamp: TIME,
    message: { role: "user", content: text },
  };
}

function answer(
  uuid: string,
  parentUuid: string | null,
  response: string,
  block: Record<string, unknown>,
) {
  return {
    type: "assistant",
    uuid,
    parentUuid,
    timestamp: TIME,
    message: {
      id: response,
      model: "claude-test",
      role: "assistant",
      content: [block],
    },
  };
}

const text = (value: string) => ({ type: "text", text: value });
const toolUse = (id: string, name: string, input: unknown) => ({
  type: "tool_use",
  id,
  name,
  input,
});

function toolResult(
  uuid: string,
  parentUuid: string,
  callId: string,
  content: unknown,
  isError?: boolean,
) {
  return {
    type: "user",
    uuid,
    parentUuid,
    timestamp: TIME,
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: callId,
          content,
          ...(isError === undefined ? {} : { is_error: isError }),
        },
      ],
    },
  };
}

function attachment(uuid: string, parentUuid: string) {
  return {
    type: "attachment",
    uuid,
    parentUuid,
    attachment: { type: "total_tokens_reminder" },
  };
}

function jsonl(...lines: unknown[]): string {
  return lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
}

function read(...lines: unknown[]): ClaudeCodeSession {
  return unwrap(readClaudeCodeSession(jsonl(...lines)));
}

/** Each step as its kind, ID and parent, which is the shape of the map. */
function shape(session: ClaudeCodeSession): string[] {
  return session.steps.map(
    (step) => `${step.kind} ${step.id} <- ${step.parentId ?? "root"}`,
  );
}

function stepById(session: ClaudeCodeSession, id: string): SessionStep {
  const step = session.steps.find((candidate) => candidate.id === id);
  if (step === undefined) throw new Error(`No step ${id}`);
  return step;
}

describe("reading a Claude Code session", () => {
  it("shows a prompt and the answers and tool calls that followed it as one step", () => {
    const session = read(
      prompt("p1", null, "List the files"),
      answer("a1", "p1", "r1", text("I'll look.")),
      answer("a2", "a1", "r1", toolUse("t1", "Bash", { command: "ls" })),
      toolResult("u1", "a2", "t1", "README.md"),
      answer("a3", "u1", "r2", text("There is one file.")),
    );

    expect(shape(session)).toEqual(["prompt p1 <- root", "activity a1 <- p1"]);
    expect(stepById(session, "a1")).toEqual({
      kind: "activity",
      id: "a1",
      parentId: "p1",
      model: "claude-test",
      timestamp: TIME,
      items: [
        { kind: "text", text: "I'll look." },
        {
          kind: "tool",
          name: "Bash",
          input: '{\n  "command": "ls"\n}',
          result: { text: "README.md", isError: false },
        },
        { kind: "text", text: "There is one file." },
      ],
    });
    expect(session.notShown).toEqual(new Map());
  });

  it("keeps parallel tool calls in one step although the session continues from the first result", () => {
    // Each call is its own line; the second one's result is a dead end.
    const session = read(
      prompt("p1", null, "Check both"),
      answer("a1", "p1", "r1", toolUse("t1", "Read", { path: "a" })),
      answer("a2", "a1", "r1", toolUse("t2", "Read", { path: "b" })),
      toolResult("u2", "a2", "t2", "b"),
      toolResult("u1", "a1", "t1", "a"),
      answer("a3", "u1", "r2", text("Both read.")),
    );

    expect(shape(session)).toEqual(["prompt p1 <- root", "activity a1 <- p1"]);
    const step = stepById(session, "a1");
    expect(step.kind === "activity" && step.items).toMatchObject([
      { name: "Read", result: { text: "a" } },
      { name: "Read", result: { text: "b" } },
      { text: "Both read." },
    ]);
  });

  it("branches where a prompt was sent again from an earlier point", () => {
    const session = read(
      prompt("p1", null, "Start"),
      answer("a1", "p1", "r1", text("Started.")),
      prompt("p2", "a1", "Go left"),
      answer("a2", "p2", "r2", text("Left.")),
      prompt("p3", "a1", "Go right"),
      answer("a3", "p3", "r3", text("Right.")),
    );

    expect(shape(session)).toEqual([
      "prompt p1 <- root",
      "activity a1 <- p1",
      "prompt p2 <- a1",
      "activity a2 <- p2",
      "prompt p3 <- a1",
      "activity a3 <- p3",
    ]);
  });

  it("branches where a second response follows the same point", () => {
    const session = read(
      prompt("p1", null, "Start"),
      answer("a1", "p1", "r1", toolUse("t1", "Bash", {})),
      toolResult("u1", "a1", "t1", "ok"),
      answer("a2", "u1", "r2", text("First try.")),
      answer("a3", "u1", "r3", text("Second try.")),
    );

    expect(shape(session)).toEqual([
      "prompt p1 <- root",
      "activity a1 <- p1",
      "activity a3 <- a1",
    ]);
  });

  it("looks through lines it does not show and counts them", () => {
    const session = read(
      prompt("p1", null, "Hello"),
      attachment("x1", "p1"),
      {
        type: "user",
        uuid: "m1",
        parentUuid: "x1",
        isMeta: true,
        message: { role: "user", content: "<local-command-caveat>" },
      },
      answer("a0", "m1", "r0", { type: "thinking", thinking: "" }),
      answer("a1", "a0", "r0", text("Hi.")),
      { type: "queue-operation", operation: "enqueue" },
      {
        type: "system",
        subtype: "stop_hook_summary",
        uuid: "s1",
        parentUuid: "a1",
      },
      prompt("p2", "s1", "Bye"),
    );

    expect(shape(session)).toEqual([
      "prompt p1 <- root",
      "activity a1 <- p1",
      "prompt p2 <- a1",
    ]);
    expect(session.notShown).toEqual(
      new Map([
        ["attachment", 1],
        ["user", 1],
        ["assistant", 1],
        ["queue-operation", 1],
        ["system", 1],
      ]),
    );
  });

  it("shows a compaction with its summary, continuing from the line it logically follows", () => {
    const session = read(
      prompt("p1", null, "Long task"),
      answer("a1", "p1", "r1", text("Working.")),
      {
        type: "system",
        subtype: "compact_boundary",
        uuid: "c1",
        parentUuid: null,
        logicalParentUuid: "a1",
        timestamp: TIME,
        content: "Conversation compacted",
      },
      attachment("x1", "c1"),
      {
        type: "user",
        uuid: "s1",
        parentUuid: "x1",
        isCompactSummary: true,
        message: { role: "user", content: "Summary of the work so far." },
      },
      answer("a2", "s1", "r2", text("Continuing.")),
    );

    expect(shape(session)).toEqual([
      "prompt p1 <- root",
      "activity a1 <- p1",
      "compaction c1 <- a1",
      "activity a2 <- c1",
    ]);
    expect(stepById(session, "c1")).toMatchObject({
      summary: "Summary of the work so far.",
    });
  });

  it("names blocks that are not text and records failed tool calls", () => {
    const session = read(
      prompt("p1", null, "Look"),
      answer("a1", "p1", "r1", toolUse("t1", "Screenshot", {})),
      toolResult(
        "u1",
        "a1",
        "t1",
        [text("Captured."), { type: "image", source: {} }],
        false,
      ),
      answer("a2", "u1", "r2", toolUse("t2", "Bash", { command: "false" })),
      toolResult("u2", "a2", "t2", "Exit code 1", true),
      {
        type: "user",
        uuid: "p2",
        parentUuid: "u2",
        message: {
          role: "user",
          content: [text("What is this?"), { type: "image", source: {} }],
        },
      },
    );

    const step = stepById(session, "a1");
    expect(step.kind === "activity" && step.items).toMatchObject([
      { result: { text: "Captured.\n\n[image]", isError: false } },
      { result: { text: "Exit code 1", isError: true } },
    ]);
    expect(stepById(session, "p2")).toMatchObject({
      parentId: "a1",
      text: "What is this?\n\n[image]",
    });
  });

  it("takes the latest title Claude Code gave the session", () => {
    const session = read(
      { type: "ai-title", aiTitle: "First title", sessionId: "s" },
      prompt("p1", null, "Hello"),
      { type: "ai-title", aiTitle: "Better title", sessionId: "s" },
    );
    expect(session.title).toBe("Better title");
    expect(read(prompt("p1", null, "Hello")).title).toBeNull();
  });

  it("makes a line whose parent is not in the transcript a root", () => {
    const session = read(prompt("p1", "elsewhere", "Resumed"));
    expect(shape(session)).toEqual(["prompt p1 <- root"]);
  });

  it("reports lines it cannot read and loads the rest", () => {
    const text = [
      JSON.stringify(prompt("p1", null, "Hello")),
      '{"type": "user", "uuid": "p2"',
      JSON.stringify({ type: "assistant", uuid: "a1", parentUuid: "p1" }),
      JSON.stringify([1, 2]),
      "",
    ].join("\n");

    const session = unwrap(readClaudeCodeSession(text));
    expect(shape(session)).toEqual(["prompt p1 <- root"]);
    expect(session.problems.map((problem) => problem.line)).toEqual([2, 3, 4]);
    expect(session.problems[0]?.message).toMatch(/^Not valid JSON/);
    expect(session.problems[2]?.message).toBe("The line has no type.");
  });

  it("reports a repeated line instead of showing it twice", () => {
    const text = jsonl(
      prompt("p1", null, "Hello"),
      prompt("p1", null, "Hello"),
    );
    const session = unwrap(readClaudeCodeSession(text));
    expect(shape(session)).toEqual(["prompt p1 <- root"]);
    expect(session.problems).toEqual([
      { line: 2, message: "Repeats the line with uuid p1." },
    ]);
  });

  it("counts a tool result whose call is not in the transcript", () => {
    const session = read(
      prompt("p1", null, "Hello"),
      toolResult("u1", "p1", "elsewhere", "ok"),
      answer("a1", "u1", "r1", text("Hi.")),
    );
    expect(shape(session)).toEqual(["prompt p1 <- root", "activity a1 <- p1"]);
    expect(session.notShown).toEqual(new Map([["tool result", 1]]));
  });

  it("fails for an empty file or one with nothing to show", () => {
    expect(errorOf(readClaudeCodeSession(" \n\n"))).toEqual({ code: "empty" });
    expect(
      errorOf(readClaudeCodeSession('{"name": "not a session"}\n')),
    ).toEqual({
      code: "no-steps",
      problems: [{ line: 1, message: "The line has no type." }],
    });
  });

  it("always yields a forest whose parents come before their children", () => {
    const line = (uuids: readonly string[]) =>
      fc.record({
        type: fc.constantFrom("user", "assistant", "attachment", "system"),
        parent: fc.option(fc.constantFrom("missing", ...uuids), {
          nil: null,
        }),
        response: fc.constantFrom("r1", "r2", "r3"),
        content: fc.constantFrom("text", "tool", "result", "thinking"),
      });
    const uuids = Array.from({ length: 30 }, (_, index) => `l${index}`);

    fc.assert(
      fc.property(fc.array(line(uuids), { maxLength: 30 }), (specs) => {
        const lines = specs.map((spec, index) => {
          const uuid = `l${index}`;
          const block =
            spec.content === "tool"
              ? toolUse(`t${index}`, "Bash", {})
              : spec.content === "thinking"
                ? { type: "thinking", thinking: "" }
                : text(`text ${index}`);
          switch (spec.type) {
            case "assistant":
              return answer(uuid, spec.parent, spec.response, block);
            case "user":
              return spec.content === "result"
                ? toolResult(
                    uuid,
                    spec.parent ?? "missing",
                    `t${index - 1}`,
                    "ok",
                  )
                : prompt(uuid, spec.parent, `prompt ${index}`);
            case "attachment":
              return attachment(uuid, spec.parent ?? "missing");
            case "system":
              return {
                type: "system",
                subtype: index % 2 === 0 ? "compact_boundary" : "other",
                uuid,
                parentUuid: null,
                logicalParentUuid: spec.parent,
              };
          }
        });
        const result = readClaudeCodeSession(jsonl(...lines));
        if (!result.ok) return;
        const seen = new Set<string>();
        for (const step of result.value.steps) {
          expect(seen.has(step.id)).toBe(false);
          if (step.parentId !== null)
            expect(seen.has(step.parentId)).toBe(true);
          seen.add(step.id);
        }
      }),
    );
  });
});
