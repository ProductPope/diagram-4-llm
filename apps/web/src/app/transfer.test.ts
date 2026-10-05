import {
  addUserTurn,
  createConversation,
  type ConversationGraph,
} from "@diagram-4-llm/core";
import { describe, expect, it } from "vitest";

import {
  exportFileName,
  parseConversationFile,
  serializeConversation,
} from "./transfer";

const T = "2026-01-01T00:00:00.000Z";

function conversation(title: string): ConversationGraph {
  const created = createConversation({ id: "c1", title, createdAt: T });
  if (!created.ok) throw new Error("fixture");
  const added = addUserTurn(created.value, {
    id: "u1",
    createdAt: T,
    parentId: null,
    refs: [],
    content: "Hi",
  });
  if (!added.ok) throw new Error("fixture");
  return added.value;
}

describe("conversation files", () => {
  it("round-trips a conversation through its file contents", () => {
    const graph = conversation("Bazy danych");
    const parsed = parseConversationFile(serializeConversation(graph));
    expect(parsed.ok && serializeConversation(parsed.value)).toBe(
      serializeConversation(graph),
    );
  });

  it("rejects text that is not JSON and documents that fail validation", () => {
    expect(parseConversationFile("{")).toMatchObject({
      ok: false,
      error: expect.stringContaining("not valid JSON") as unknown,
    });
    expect(
      parseConversationFile(JSON.stringify({ format: "something else" })),
    ).toMatchObject({ ok: false });
  });

  it("derives a safe file name from the title", () => {
    expect(
      exportFileName(conversation("Które bazy danych? SQLite / Postgres")),
    ).toBe("ktore-bazy-danych-sqlite-postgres.diagram-4-llm.json");
    expect(exportFileName(conversation("???"))).toBe(
      "conversation.diagram-4-llm.json",
    );
  });
});
