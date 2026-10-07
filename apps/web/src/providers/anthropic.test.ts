// @vitest-environment node
import type { AssembledContext } from "@diagram-4-llm/core";
import { describe, expect, it } from "vitest";

import {
  createAnthropicAdapter,
  DEFAULT_MAX_OUTPUT_TOKENS,
  listAnthropicModels,
} from "./anthropic";
import {
  collect,
  jsonBody,
  sse,
  streamedResponse,
  urlOf,
} from "./test-support/responses";
import type { ChatRequest } from "./types";

// Hand-written in the documented Messages API streaming format. Not recorded
// from the live API.
function messageStream(texts: readonly string[], stopReason: string): string {
  return sse([
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 10,
            cache_read_input_tokens: 5,
            cache_creation_input_tokens: 0,
            output_tokens: 1,
          },
        },
      },
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
    },
    ...texts.map((text) => ({
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text },
      },
    })),
    {
      event: "content_block_stop",
      data: { type: "content_block_stop", index: 0 },
    },
    {
      event: "message_delta",
      data: {
        type: "message_delta",
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: 7 },
      },
    },
    { event: "message_stop", data: { type: "message_stop" } },
  ]);
}

const context: AssembledContext = {
  system: "Be brief.",
  messages: [{ role: "user", content: "Hi" }],
  manifest: { entries: [], estimatedInputTokens: 2 },
};
const request: ChatRequest = { model: "claude-opus-5-5", context, params: {} };

function adapterReturning(
  makeResponse: () => Response,
  bodies: unknown[] = [],
) {
  return createAnthropicAdapter({
    apiKey: "test-key",
    fetch: (_input, init) => {
      bodies.push(jsonBody(init));
      return Promise.resolve(makeResponse());
    },
  });
}

describe("anthropic adapter", () => {
  it("streams text, then reports the stop reason and usage including cached input", async () => {
    const events = await collect(
      adapterReturning(() =>
        streamedResponse(messageStream(["Hel", "lo"], "end_turn"), {
          chunkSizes: [13],
        }),
      ).stream(request, new AbortController().signal),
    );
    expect(events).toEqual([
      { type: "text", text: "Hel" },
      { type: "text", text: "lo" },
      {
        type: "done",
        stopReason: "end",
        usage: { inputTokens: 15, outputTokens: 7 },
      },
    ]);
  });

  it("sends the system prompt separately and the default output limit", async () => {
    const bodies: unknown[] = [];
    await collect(
      adapterReturning(
        () => streamedResponse(messageStream([], "end_turn")),
        bodies,
      ).stream(request, new AbortController().signal),
    );
    expect(bodies[0]).toEqual({
      model: "claude-opus-5-5",
      max_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
      messages: [{ role: "user", content: "Hi" }],
      system: "Be brief.",
      stream: true,
    });
  });

  it("maps a refusal to the refusal stop reason", async () => {
    const events = await collect(
      adapterReturning(() =>
        streamedResponse(messageStream(["I can't"], "refusal")),
      ).stream(request, new AbortController().signal),
    );
    expect(events.at(-1)).toMatchObject({
      type: "done",
      stopReason: "refusal",
    });
  });

  it("reports an API error with its type", async () => {
    const error = {
      type: "error",
      error: { type: "authentication_error", message: "invalid x-api-key" },
    };
    const events = await collect(
      adapterReturning(
        () =>
          new Response(JSON.stringify(error), {
            status: 401,
            headers: { "content-type": "application/json" },
          }),
      ).stream(request, new AbortController().signal),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "error",
      error: { code: "authentication_error" },
    });
  });

  it("reports cancellation as aborted, not as an error", async () => {
    const controller = new AbortController();
    controller.abort();
    const events = await collect(
      adapterReturning(() =>
        streamedResponse(messageStream(["x"], "end_turn")),
      ).stream(request, controller.signal),
    );
    expect(events).toEqual([{ type: "aborted" }]);
  });
});

// Pages in the documented List Models format (the SDK's PageResponse and
// ModelInfo types). Not recorded from the live API.
function modelPage(ids: readonly string[], hasMore: boolean): Response {
  return new Response(
    JSON.stringify({
      data: ids.map((id) => ({
        type: "model",
        id,
        display_name: id,
        created_at: "2026-01-01T00:00:00Z",
      })),
      has_more: hasMore,
      first_id: ids[0] ?? null,
      last_id: ids.at(-1) ?? null,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("listAnthropicModels", () => {
  it("collects model IDs across pages", async () => {
    const urls: string[] = [];
    const result = await listAnthropicModels(
      {
        apiKey: "k",
        fetch: (input) => {
          urls.push(urlOf(input));
          return Promise.resolve(
            urls.length === 1
              ? modelPage(["claude-opus-5-5", "claude-sonnet-5-5"], true)
              : modelPage(["claude-haiku-4-5-20251001"], false),
          );
        },
      },
      new AbortController().signal,
    );
    expect(result).toEqual({
      ok: true,
      value: [
        "claude-opus-5-5",
        "claude-sonnet-5-5",
        "claude-haiku-4-5-20251001",
      ],
    });
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("/v1/models");
    expect(urls[1]).toContain("after_id=claude-sonnet-5-5");
  });

  it("reports a rejected key as an error value", async () => {
    const result = await listAnthropicModels(
      {
        apiKey: "wrong",
        fetch: () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                type: "error",
                error: {
                  type: "authentication_error",
                  message: "invalid x-api-key",
                },
              }),
              { status: 401, headers: { "content-type": "application/json" } },
            ),
          ),
      },
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "authentication_error" },
    });
  });
});
