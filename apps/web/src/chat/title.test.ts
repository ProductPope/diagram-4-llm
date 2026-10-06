// @vitest-environment node
import {
  addUserTurn,
  appendAssistantContent,
  createConversation,
  finishAssistantTurn,
  startAssistantTurn,
  type ConversationGraph,
  type Result,
} from "@diagram-4-llm/core";
import { describe, expect, it } from "vitest";

import type {
  ChatRequest,
  ProviderAdapter,
  StreamEvent,
} from "../providers/types";
import { createStore } from "./store";
import { cleanTitle, titleAnswer } from "./title";

const T = "2026-01-01T00:00:00.000Z";

function unwrap<V>(result: Result<V, unknown>): V {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

function scriptedAdapter(
  events: readonly StreamEvent[],
  requests: ChatRequest[] = [],
): ProviderAdapter {
  return {
    id: "anthropic",
    async *stream(request) {
      requests.push(request);
      for (const event of events) {
        await Promise.resolve();
        yield event;
      }
    },
  };
}

/** A conversation with one question and an answer that has `status`. */
function conversation(finished: boolean): ConversationGraph {
  let graph = unwrap(createConversation({ id: "c", title: "t", createdAt: T }));
  graph = unwrap(
    addUserTurn(graph, {
      id: "u",
      parentId: null,
      refs: [],
      content: "Which database should I use?",
      createdAt: T,
    }),
  );
  graph = unwrap(
    startAssistantTurn(graph, {
      id: "a",
      parentId: "u",
      createdAt: T,
      adapter: "anthropic",
      model: "m",
      params: {},
      systemPrompt: null,
    }),
  );
  graph = unwrap(appendAssistantContent(graph, "a", "Use SQLite for this."));
  return finished
    ? unwrap(
        finishAssistantTurn(graph, "a", {
          status: "complete",
          stopReason: "end",
        }),
      )
    : graph;
}

const done: StreamEvent = { type: "done", stopReason: "end" };

describe("titleAnswer", () => {
  it("sends only the answer and stores the title as presentation state", async () => {
    const store = createStore(conversation(true));
    const requests: ChatRequest[] = [];
    const adapter = scriptedAdapter(
      [
        { type: "text", text: "SQLite " },
        { type: "text", text: "advice" },
        done,
      ],
      requests,
    );

    const result = await titleAnswer(
      store,
      "a",
      adapter,
      "small-model",
      new AbortController().signal,
    );

    expect(result).toEqual({ ok: true, value: "SQLite advice" });
    expect(store.get().meta.get("a")).toEqual({ title: "SQLite advice" });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.model).toBe("small-model");
    expect(requests[0]?.context.messages).toEqual([
      { role: "user", content: "Use SQLite for this." },
    ]);
    // The conversation itself is unchanged.
    expect(store.get().nodes).toEqual(conversation(true).nodes);
  });

  it("keeps other presentation state of the answer", async () => {
    const store = createStore(conversation(true));
    store.set({
      ...store.get(),
      meta: new Map([["a", { collapsed: true }]]),
    });
    await titleAnswer(
      store,
      "a",
      scriptedAdapter([{ type: "text", text: "Title" }, done]),
      "m",
      new AbortController().signal,
    );
    expect(store.get().meta.get("a")).toEqual({
      collapsed: true,
      title: "Title",
    });
  });

  it("does not title an unfinished answer or ask the model", async () => {
    const requests: ChatRequest[] = [];
    const result = await titleAnswer(
      createStore(conversation(false)),
      "a",
      scriptedAdapter([done], requests),
      "m",
      new AbortController().signal,
    );
    expect(result).toEqual({ ok: true, value: null });
    expect(requests).toEqual([]);
  });

  it("adds no title when the user stops the request", async () => {
    const store = createStore(conversation(true));
    const before = store.get();
    const result = await titleAnswer(
      store,
      "a",
      scriptedAdapter([{ type: "text", text: "Half" }, { type: "aborted" }]),
      "m",
      new AbortController().signal,
    );
    expect(result).toEqual({ ok: true, value: null });
    expect(store.get()).toBe(before);
  });

  it("reports provider errors and leaves the graph unchanged", async () => {
    const store = createStore(conversation(true));
    const before = store.get();
    const result = await titleAnswer(
      store,
      "a",
      scriptedAdapter([
        { type: "error", error: { code: "http-429", message: "Slow down" } },
      ]),
      "m",
      new AbortController().signal,
    );
    expect(result).toEqual({
      ok: false,
      error: { code: "http-429", message: "Slow down" },
    });
    expect(store.get()).toBe(before);
  });

  it("rejects an empty title", async () => {
    const store = createStore(conversation(true));
    const result = await titleAnswer(
      store,
      "a",
      scriptedAdapter([{ type: "text", text: ' "" ' }, done]),
      "m",
      new AbortController().signal,
    );
    expect(result.ok).toBe(false);
    expect(store.get().meta.get("a")).toBeUndefined();
  });
});

describe("cleanTitle", () => {
  it.each([
    ['"Choosing a database"', "Choosing a database"],
    ["**Choosing a database**.", "Choosing a database"],
    ["Title: Choosing a database", "Choosing a database"],
    ["# Choosing a database\nSome explanation", "Choosing a database"],
    ["\n\n  Choosing a database.  ", "Choosing a database"],
  ])("cleans %j", (reply, expected) => {
    expect(cleanTitle(reply)).toBe(expected);
  });

  it("shortens a title that is too long", () => {
    const title = cleanTitle("word ".repeat(40));
    expect(title).toHaveLength(80);
    expect(title.endsWith("…")).toBe(true);
  });
});
