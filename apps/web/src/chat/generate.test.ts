// @vitest-environment node
import {
  addUserTurn,
  createConversation,
  setNodeMeta,
  type ConversationGraph,
} from "@diagram-4-llm/core";
import { describe, expect, it } from "vitest";

import type {
  ChatRequest,
  ProviderAdapter,
  StreamEvent,
} from "../providers/types";
import {
  generateAnswer,
  sendMessage,
  type GenerationSettings,
} from "./generate";
import { createStore, type Store } from "./store";

const T = "2026-01-01T00:00:00.000Z";

function unwrap<T>(
  result: { ok: true; value: T } | { ok: false; error: unknown },
): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

/** An adapter that replays the given events and records the requests it receives. */
function scriptedAdapter(
  events: readonly StreamEvent[],
  requests: ChatRequest[] = [],
): ProviderAdapter {
  return {
    id: "openai-compatible",
    async *stream(request) {
      requests.push(request);
      for (const event of events) {
        await Promise.resolve();
        yield event;
      }
    },
  };
}

function setup(events: readonly StreamEvent[], requests: ChatRequest[] = []) {
  const graph: Store<ConversationGraph> = createStore(
    unwrap(createConversation({ id: "c1", title: "t", createdAt: T })),
  );
  let counter = 0;
  const env = { newId: () => `n${String(++counter)}`, now: () => T };
  const settings: GenerationSettings = {
    adapter: scriptedAdapter(events, requests),
    baseUrl: "http://localhost:11434/v1",
    model: "llama3",
    params: {},
    systemPrompt: "Be brief.",
  };
  return { graph, env, settings };
}

describe("sendMessage", () => {
  it("adds the user turn and streams the answer into the graph", async () => {
    const requests: ChatRequest[] = [];
    const { graph, env, settings } = setup(
      [
        { type: "text", text: "Hel" },
        { type: "text", text: "lo" },
        {
          type: "done",
          stopReason: "end",
          usage: { inputTokens: 5, outputTokens: 2 },
        },
      ],
      requests,
    );

    const ids = unwrap(
      await sendMessage(
        graph,
        { parentId: null, refs: [], content: "Hi" },
        settings,
        env,
        new AbortController().signal,
      ),
    );

    expect(graph.get().nodes.get(ids.userTurnId)).toMatchObject({
      kind: "user",
      content: "Hi",
    });
    expect(graph.get().nodes.get(ids.assistantTurnId)).toMatchObject({
      kind: "assistant",
      content: "Hello",
      status: "complete",
      stopReason: "end",
      generation: {
        adapter: "openai-compatible",
        baseUrl: "http://localhost:11434/v1",
        model: "llama3",
        systemPrompt: "Be brief.",
        usage: { inputTokens: 5, outputTokens: 2 },
      },
    });
    expect(requests[0]?.context.messages).toEqual([
      { role: "user", content: "Hi" },
    ]);
    expect(requests[0]?.context.system).toBe("Be brief.");
  });

  it("publishes each streamed delta to subscribers", async () => {
    const { graph, env, settings } = setup([
      { type: "text", text: "a" },
      { type: "text", text: "b" },
      { type: "done", stopReason: "end" },
    ]);
    const seen: string[] = [];
    graph.subscribe(() => {
      for (const node of graph.get().nodes.values()) {
        if (node.kind === "assistant")
          seen.push(`${node.status}:${node.content}`);
      }
    });

    await sendMessage(
      graph,
      { parentId: null, refs: [], content: "Hi" },
      settings,
      env,
      new AbortController().signal,
    );

    expect(seen).toEqual([
      "streaming:",
      "streaming:a",
      "streaming:ab",
      "complete:ab",
    ]);
  });

  it("does not call the provider when the draft is invalid", async () => {
    const requests: ChatRequest[] = [];
    const { graph, env, settings } = setup([], requests);
    const result = await sendMessage(
      graph,
      { parentId: null, refs: [], content: "  " },
      settings,
      env,
      new AbortController().signal,
    );
    expect(result).toEqual({ ok: false, error: { code: "empty-content" } });
    expect(requests).toEqual([]);
    expect(graph.get().nodes.size).toBe(0);
  });
});

describe("generateAnswer", () => {
  it("records aborted and failed answers with the content received so far", async () => {
    for (const [last, expected] of [
      [{ type: "aborted" }, { status: "aborted" }],
      [
        { type: "error", error: { code: "http-500", message: "boom" } },
        { status: "error", error: { code: "http-500" } },
      ],
    ] as const) {
      const { graph, env, settings } = setup([
        { type: "text", text: "part" },
        last,
      ]);
      graph.set(
        unwrap(
          addUserTurn(graph.get(), {
            id: "u",
            createdAt: T,
            parentId: null,
            refs: [],
            content: "Hi",
          }),
        ),
      );

      const id = unwrap(
        await generateAnswer(
          graph,
          "u",
          settings,
          env,
          new AbortController().signal,
        ),
      );

      expect(graph.get().nodes.get(id)).toMatchObject({
        content: "part",
        ...expected,
      });
    }
  });

  it("reports a stream that ends without a terminal event as an error", async () => {
    const { graph, env, settings } = setup([{ type: "text", text: "x" }]);
    graph.set(
      unwrap(
        addUserTurn(graph.get(), {
          id: "u",
          createdAt: T,
          parentId: null,
          refs: [],
          content: "Hi",
        }),
      ),
    );
    const id = unwrap(
      await generateAnswer(
        graph,
        "u",
        settings,
        env,
        new AbortController().signal,
      ),
    );
    expect(graph.get().nodes.get(id)).toMatchObject({
      status: "error",
      error: { code: "no-result" },
    });
  });

  it("keeps changes made to the graph while the answer streams", async () => {
    const { graph, env, settings } = setup([
      { type: "text", text: "a" },
      { type: "done", stopReason: "end" },
    ]);
    graph.set(
      unwrap(
        addUserTurn(graph.get(), {
          id: "u",
          createdAt: T,
          parentId: null,
          refs: [],
          content: "Hi",
        }),
      ),
    );
    const unsubscribe = graph.subscribe(() => {
      if (!graph.get().meta.has("u"))
        graph.set(unwrap(setNodeMeta(graph.get(), "u", { title: "Greeting" })));
    });

    await generateAnswer(
      graph,
      "u",
      settings,
      env,
      new AbortController().signal,
    );
    unsubscribe();

    expect(graph.get().meta.get("u")).toEqual({ title: "Greeting" });
  });
});
