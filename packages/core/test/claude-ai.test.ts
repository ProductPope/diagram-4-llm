import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { readClaudeAiExport, type SessionStep } from "../src/index.js";

// Hand-written in the shape of a Claude.ai export of 2026-10-08. The
// content is made up; only the field names and structure follow the export.

const ROOT = "00000000-0000-4000-8000-000000000000";
const T = "2026-10-08T12:00:00.000000Z";

function human(uuid: string, parent: string, text: string, extra = {}) {
  return {
    uuid,
    text,
    content: [
      { type: "text", text, citations: [], flags: null },
      { type: "injected_prompt_block", prompt: "Style guidance" },
    ],
    sender: "human",
    created_at: T,
    updated_at: T,
    attachments: [],
    files: [],
    parent_message_uuid: parent,
    ...extra,
  };
}

function assistant(uuid: string, parent: string, content: unknown[]) {
  return {
    uuid,
    text: "ignored: the blocks are read instead",
    content,
    sender: "assistant",
    created_at: T,
    updated_at: T,
    attachments: [],
    files: [],
    parent_message_uuid: parent,
  };
}

function conversation(
  uuid: string,
  name: string,
  updatedAt: string,
  messages: unknown[],
) {
  return {
    uuid,
    name,
    summary: "",
    created_at: T,
    updated_at: updatedAt,
    account: { uuid: "account" },
    chat_messages: messages,
  };
}

const databases = conversation("c1", "Databases", "2026-10-02T00:00:00Z", [
  human("h1", ROOT, "Which database?"),
  assistant("a1", "h1", [
    { type: "thinking", thinking: "Weighing options", summaries: [] },
    {
      type: "tool_use",
      id: "t1",
      name: "web_search",
      input: { query: "sqlite vs postgres" },
    },
    {
      type: "tool_result",
      tool_use_id: "t1",
      name: "web_search",
      content: [
        {
          type: "knowledge",
          title: "SQLite docs",
          url: "https://sqlite.org",
          metadata: {},
        },
        { type: "text", text: "Small and embedded." },
      ],
      is_error: false,
    },
    { type: "text", text: "SQLite.", citations: [] },
  ]),
  // Two questions after the same answer, which the parent links allow.
  human("h2", "a1", "Why not PostgreSQL?", {
    attachments: [
      {
        file_name: "notes.txt",
        file_size: 4,
        file_type: "text/plain",
        extracted_content: "not shown",
      },
    ],
  }),
  human("h3", "a1", "How do I back it up?"),
  assistant("a3", "h3", [{ type: "text", text: "Copy the file." }]),
]);

describe("readClaudeAiExport", () => {
  it("maps each conversation's messages, branches included", () => {
    const read = readClaudeAiExport([databases]);
    if (!read.ok) throw new Error(read.error.code);
    expect(read.value.problems).toEqual([]);
    const [first] = read.value.conversations;
    expect(first.title).toBe("Databases");
    expect(first.steps).toEqual([
      {
        kind: "prompt",
        id: "h1",
        parentId: null,
        text: "Which database?",
        timestamp: T,
      },
      {
        kind: "activity",
        id: "a1",
        parentId: "h1",
        model: null,
        items: [
          {
            kind: "tool",
            name: "web_search",
            input: '{\n  "query": "sqlite vs postgres"\n}',
            result: {
              text: "SQLite docs (https://sqlite.org)\n\nSmall and embedded.",
              isError: false,
            },
          },
          { kind: "text", text: "SQLite." },
        ],
        timestamp: T,
      },
      {
        kind: "prompt",
        id: "h2",
        parentId: "a1",
        text: "Why not PostgreSQL?\n\n[Attached: notes.txt]",
        timestamp: T,
      },
      {
        kind: "prompt",
        id: "h3",
        parentId: "a1",
        text: "How do I back it up?",
        timestamp: T,
      },
      {
        kind: "activity",
        id: "a3",
        parentId: "h3",
        model: null,
        items: [{ kind: "text", text: "Copy the file." }],
        timestamp: T,
      },
    ]);
    expect(first.notShown).toEqual(
      new Map([
        ["injected_prompt_block", 3],
        ["thinking", 1],
      ]),
    );
  });

  it("lists the most recently updated conversation first", () => {
    const read = readClaudeAiExport([
      databases,
      conversation("c2", "", "2026-10-05T00:00:00Z", [
        human("x1", ROOT, "Hello"),
      ]),
    ]);
    if (!read.ok) throw new Error(read.error.code);
    expect(read.value.conversations.map((c) => c.title)).toEqual([
      "Untitled conversation",
      "Databases",
    ]);
  });

  it("puts parents first whatever order the export lists them in", () => {
    const read = readClaudeAiExport([
      conversation("c1", "Out of order", T, [
        assistant("a1", "h1", [{ type: "text", text: "Hi." }]),
        human("h1", ROOT, "Hello"),
      ]),
    ]);
    if (!read.ok) throw new Error(read.error.code);
    expect(read.value.conversations[0].steps.map((s) => s.id)).toEqual([
      "h1",
      "a1",
    ]);
  });

  it("keeps the children of an answer with nothing to show", () => {
    const read = readClaudeAiExport([
      conversation("c1", "Hidden answer", T, [
        human("h1", ROOT, "Think first"),
        assistant("a1", "h1", [{ type: "thinking", thinking: "Hmm" }]),
        human("h2", "a1", "And now?"),
      ]),
    ]);
    if (!read.ok) throw new Error(read.error.code);
    const [only] = read.value.conversations;
    expect(only.steps.map((s) => [s.id, s.parentId])).toEqual([
      ["h1", null],
      ["h2", "h1"],
    ]);
    expect(only.notShown.get("empty answer")).toBe(1);
  });

  it("reports what it cannot read and loads the rest", () => {
    const read = readClaudeAiExport([
      { uuid: "broken" },
      conversation("c1", "Partly broken", T, [
        human("h1", ROOT, "Hello"),
        { uuid: "m2", sender: "robot", content: [] },
        // A loop that never reaches the start of the conversation.
        human("h3", "h4", "Lost"),
        human("h4", "h3", "Also lost"),
      ]),
    ]);
    if (!read.ok) throw new Error(read.error.code);
    expect(read.value.conversations[0].steps.map((s) => s.id)).toEqual(["h1"]);
    expect(read.value.problems).toEqual([
      "Conversation 1 could not be read: name: Invalid input: expected string, received undefined",
      'Partly broken, message 2 could not be read: sender: Invalid option: expected one of "human"|"assistant"',
      "Partly broken: some messages are not linked to the start of the conversation and are not on the map.",
    ]);
  });

  it("refuses files that are not an export", () => {
    expect(readClaudeAiExport({ conversations: [] })).toEqual({
      ok: false,
      error: { code: "not-an-export" },
    });
    expect(readClaudeAiExport([])).toEqual({
      ok: false,
      error: { code: "empty" },
    });
    const none = readClaudeAiExport([{}]);
    expect(none.ok ? null : none.error.code).toBe("no-conversations");
  });

  it("always lists a step after the step it follows", () => {
    // Messages that each name an earlier or a later message as parent, in
    // any order, including loops.
    const messages = fc.integer({ min: 1, max: 15 }).chain((count) =>
      fc.tuple(
        fc.array(fc.integer({ min: -1, max: count - 1 }), {
          minLength: count,
          maxLength: count,
        }),
        fc.array(fc.boolean(), { minLength: count, maxLength: count }),
      ),
    );
    fc.assert(
      fc.property(messages, ([parents, humans]) => {
        const list = parents.map((parent, i) =>
          humans[i] === true
            ? human(
                `m${String(i)}`,
                parent < 0 ? ROOT : `m${String(parent)}`,
                "Q",
              )
            : assistant(
                `m${String(i)}`,
                parent < 0 ? ROOT : `m${String(parent)}`,
                [{ type: "text", text: "A" }],
              ),
        );
        const read = readClaudeAiExport([conversation("c", "P", T, list)]);
        if (!read.ok) throw new Error(read.error.code);
        const seen = new Set<string>();
        const steps: readonly SessionStep[] = read.value.conversations[0].steps;
        for (const step of steps) {
          expect(step.parentId === null || seen.has(step.parentId)).toBe(true);
          expect(seen.has(step.id)).toBe(false);
          seen.add(step.id);
        }
      }),
    );
  });
});
