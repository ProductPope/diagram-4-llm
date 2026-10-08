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
import type { GenerationSettings } from "./generate";
import { createStore } from "./store";
import { summarise, SUMMARY_INSTRUCTION } from "./summary";

const T = "2026-01-01T00:00:00.000Z";
const env = { newId: () => "s", now: () => T };
const covers = { fromId: "u", toId: "a" };

function unwrap<V>(result: Result<V, unknown>): V {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

function settings(
  events: readonly StreamEvent[],
  requests: ChatRequest[] = [],
): GenerationSettings {
  const adapter: ProviderAdapter = {
    id: "openai-compatible",
    async *stream(request) {
      requests.push(request);
      for (const event of events) {
        await Promise.resolve();
        yield event;
      }
    },
  };
  return {
    adapter,
    baseUrl: "http://localhost:11434/v1",
    model: "local-model",
    params: {},
    systemPrompt: "The user's own system prompt.",
  };
}

/** One question and its finished answer. */
function conversation(): ConversationGraph {
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
  return unwrap(
    finishAssistantTurn(graph, "a", { status: "complete", stopReason: "end" }),
  );
}

describe("summarise", () => {
  it("sends the branch as a transcript and saves the finished summary", async () => {
    const store = createStore(conversation());
    const requests: ChatRequest[] = [];
    const written: string[] = [];
    const result = await summarise(
      store,
      covers,
      settings(
        [
          { type: "text", text: "The user chose " },
          { type: "text", text: "SQLite." },
          {
            type: "done",
            stopReason: "end",
            usage: { inputTokens: 40, outputTokens: 5 },
          },
        ],
        requests,
      ),
      env,
      new AbortController().signal,
      (text) => written.push(text),
    );

    expect(result).toEqual({ ok: true, value: "s" });
    expect(written).toEqual(["The user chose ", "The user chose SQLite."]);
    expect(requests[0]?.model).toBe("local-model");
    expect(requests[0]?.context).toMatchObject({
      system: SUMMARY_INSTRUCTION,
      messages: [
        {
          role: "user",
          content:
            '<turn role="user">\nWhich database should I use?\n</turn>\n\n' +
            '<turn role="assistant">\nUse SQLite for this.\n</turn>',
        },
      ],
    });
    const summary = store.get().nodes.get("s");
    expect(summary).toMatchObject({
      kind: "summary",
      covers,
      content: "The user chose SQLite.",
      generation: {
        adapter: "openai-compatible",
        baseUrl: "http://localhost:11434/v1",
        model: "local-model",
        systemPrompt: SUMMARY_INSTRUCTION,
        manifest: {
          entries: [
            { nodeId: "u", via: "path" },
            { nodeId: "a", via: "path" },
          ],
        },
        usage: { inputTokens: 40, outputTokens: 5 },
      },
    });
  });

  it.each([
    ["max-tokens", "The summary was cut off by the output limit."],
    ["refusal", "The model did not finish the summary."],
  ] as const)(
    "saves nothing when the summary ends with %s",
    async (stopReason, message) => {
      const store = createStore(conversation());
      const result = await summarise(
        store,
        covers,
        settings([
          { type: "text", text: "The user" },
          { type: "done", stopReason },
        ]),
        env,
        new AbortController().signal,
        () => undefined,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain(message);
      expect(store.get().nodes.has("s")).toBe(false);
    },
  );

  it("saves nothing when the user stops it", async () => {
    const store = createStore(conversation());
    const result = await summarise(
      store,
      covers,
      settings([{ type: "text", text: "The user" }, { type: "aborted" }]),
      env,
      new AbortController().signal,
      () => undefined,
    );

    expect(result).toEqual({ ok: true, value: null });
    expect(store.get().nodes.has("s")).toBe(false);
  });

  it("reports a provider error", async () => {
    const error = { code: "http-500", message: "Server error" };
    const store = createStore(conversation());
    const result = await summarise(
      store,
      covers,
      settings([{ type: "error", error }]),
      env,
      new AbortController().signal,
      () => undefined,
    );

    expect(result).toEqual({ ok: false, error });
    expect(store.get().nodes.has("s")).toBe(false);
  });

  it("rejects an empty summary", async () => {
    const store = createStore(conversation());
    const result = await summarise(
      store,
      covers,
      settings([
        { type: "text", text: "  " },
        { type: "done", stopReason: "end" },
      ]),
      env,
      new AbortController().signal,
      () => undefined,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "empty-summary" },
    });
    expect(store.get().nodes.has("s")).toBe(false);
  });
});
