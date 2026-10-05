// @vitest-environment node
import {
  addUserTurn,
  appendAssistantContent,
  createConversation,
  exportConversation,
  finishAssistantTurn,
  startAssistantTurn,
  type ConversationGraph,
} from "@diagram-4-llm/core";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import {
  DATABASE_NAME,
  openConversationStore,
  type ConversationStore,
} from "./conversation-store";

const T = "2026-01-01T00:00:00.000Z";

function unwrap<T>(
  result: { ok: true; value: T } | { ok: false; error: unknown },
): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

async function openStore(
  factory = new IDBFactory(),
): Promise<ConversationStore> {
  return unwrap(await openConversationStore(factory));
}

/** A conversation whose second answer is still streaming. */
function conversation(id = "c1", title = "Databases"): ConversationGraph {
  let graph = unwrap(createConversation({ id, title, createdAt: T }));
  graph = unwrap(
    addUserTurn(graph, {
      id: "u1",
      createdAt: T,
      parentId: null,
      refs: [],
      content: "Which database?",
    }),
  );
  const answer = (g: ConversationGraph, aid: string, parentId: string) =>
    unwrap(
      startAssistantTurn(g, {
        id: aid,
        createdAt: T,
        parentId,
        adapter: "anthropic",
        model: "m",
        params: {},
        systemPrompt: null,
      }),
    );
  graph = answer(graph, "a1", "u1");
  graph = unwrap(appendAssistantContent(graph, "a1", "It depends."));
  graph = unwrap(
    finishAssistantTurn(graph, "a1", { status: "complete", stopReason: "end" }),
  );
  graph = answer(graph, "a2", "u1");
  graph = unwrap(appendAssistantContent(graph, "a2", "Partial"));
  return graph;
}

describe("conversation store", () => {
  it("saves and loads a conversation through the export format", async () => {
    const store = await openStore();
    const graph = unwrap(
      finishAssistantTurn(conversation(), "a2", {
        status: "complete",
        stopReason: "end",
      }),
    );
    unwrap(await store.save(graph, T));

    const loaded = unwrap(await store.load("c1"));
    expect(exportConversation(loaded)).toEqual(exportConversation(graph));
  });

  it("marks turns that were still streaming as aborted, keeping their content", async () => {
    const store = await openStore();
    unwrap(await store.save(conversation(), T));

    const loaded = unwrap(await store.load("c1"));
    expect(loaded.nodes.get("a2")).toMatchObject({
      status: "aborted",
      content: "Partial",
    });
    expect(loaded.nodes.get("a1")).toMatchObject({
      status: "complete",
      stopReason: "end",
    });
  });

  it("lists conversations, most recently updated first", async () => {
    const store = await openStore();
    unwrap(
      await store.save(conversation("old", "Old"), "2026-01-01T00:00:00.000Z"),
    );
    unwrap(
      await store.save(conversation("new", "New"), "2026-02-01T00:00:00.000Z"),
    );
    expect(unwrap(await store.list())).toEqual([
      { id: "new", title: "New", updatedAt: "2026-02-01T00:00:00.000Z" },
      { id: "old", title: "Old", updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("replaces a conversation on save and removes it on delete", async () => {
    const store = await openStore();
    const graph = conversation();
    unwrap(await store.save(graph, T));
    unwrap(
      await store.save(
        unwrap(finishAssistantTurn(graph, "a2", { status: "aborted" })),
        T,
      ),
    );
    expect(unwrap(await store.list())).toHaveLength(1);

    unwrap(await store.remove("c1"));
    expect(await store.load("c1")).toEqual({
      ok: false,
      error: { code: "not-found", id: "c1" },
    });
  });

  it("keeps data across connections to the same database", async () => {
    const factory = new IDBFactory();
    unwrap(await (await openStore(factory)).save(conversation(), T));
    expect(unwrap(await (await openStore(factory)).list())).toHaveLength(1);
  });

  it("reports a stored document that fails validation instead of loading part of it", async () => {
    const factory = new IDBFactory();
    await openStore(factory);
    const document = exportConversation(conversation());
    const tampered = {
      ...document,
      nodes: [document.nodes[1], document.nodes[0], ...document.nodes.slice(2)],
    };

    // Write the broken record directly, as a bug in an older version might have.
    await new Promise<void>((resolve, reject) => {
      const open = factory.open(DATABASE_NAME);
      open.onsuccess = () => {
        const tx = open.result.transaction("conversations", "readwrite");
        tx.objectStore("conversations").put({
          id: "c1",
          title: "Databases",
          updatedAt: T,
          document: tampered,
        });
        tx.oncomplete = () => {
          open.result.close();
          resolve();
        };
        tx.onerror = () => {
          reject(tx.error ?? new Error("write failed"));
        };
      };
    });

    const loaded = await (await openStore(factory)).load("c1");
    expect(loaded).toMatchObject({
      ok: false,
      error: { code: "corrupt", id: "c1" },
    });
  });
});
