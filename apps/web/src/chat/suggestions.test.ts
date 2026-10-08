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
import { parseSuggestions, suggestFollowUps } from "./suggestions";

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

/** A question and an answer that is `finished` or still streaming. */
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

describe("suggestFollowUps", () => {
  it("sends only the question and the answer, and leaves the conversation as it is", async () => {
    const graph = conversation(true);
    const requests: ChatRequest[] = [];
    const result = await suggestFollowUps(
      graph,
      "a",
      scriptedAdapter(
        [
          { type: "text", text: "Why not PostgreSQL?\nHow do I back " },
          { type: "text", text: "it up?\nIs it fast enough?" },
          done,
        ],
        requests,
      ),
      "small-model",
      new AbortController().signal,
    );

    expect(result).toEqual({
      ok: true,
      value: [
        "Why not PostgreSQL?",
        "How do I back it up?",
        "Is it fast enough?",
      ],
    });
    expect(requests[0]?.model).toBe("small-model");
    expect(requests[0]?.context.messages).toEqual([
      {
        role: "user",
        content:
          "Question:\nWhich database should I use?\n\nAnswer:\nUse SQLite for this.",
      },
    ]);
    expect(graph.nodes).toEqual(conversation(true).nodes);
  });

  it("suggests nothing for an unfinished answer, without a request", async () => {
    const requests: ChatRequest[] = [];
    const result = await suggestFollowUps(
      conversation(false),
      "a",
      scriptedAdapter([done], requests),
      "small-model",
      new AbortController().signal,
    );
    expect(result).toEqual({ ok: true, value: null });
    expect(requests).toHaveLength(0);
  });

  it("resolves with nothing when the user stops it", async () => {
    const result = await suggestFollowUps(
      conversation(true),
      "a",
      scriptedAdapter([{ type: "text", text: "Why" }, { type: "aborted" }]),
      "small-model",
      new AbortController().signal,
    );
    expect(result).toEqual({ ok: true, value: null });
  });

  it("reports a provider error and an empty reply", async () => {
    const error = { code: "http-500", message: "Server error" };
    expect(
      await suggestFollowUps(
        conversation(true),
        "a",
        scriptedAdapter([{ type: "error", error }]),
        "small-model",
        new AbortController().signal,
      ),
    ).toEqual({ ok: false, error });
    expect(
      await suggestFollowUps(
        conversation(true),
        "a",
        scriptedAdapter([{ type: "text", text: "\n \n" }, done]),
        "small-model",
        new AbortController().signal,
      ),
    ).toMatchObject({ ok: false, error: { code: "no-suggestions" } });
  });
});

describe("parseSuggestions", () => {
  it("drops numbering, bullets, quotes and empty lines", () => {
    expect(
      parseSuggestions('1. "First?"\n\n- Second?\n* Third?\n2) Fourth?'),
    ).toEqual(["First?", "Second?", "Third?"]);
  });

  it("keeps each question once", () => {
    expect(parseSuggestions("Why?\n1. Why?\nHow?")).toEqual(["Why?", "How?"]);
  });
});
