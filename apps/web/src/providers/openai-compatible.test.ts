// @vitest-environment node
import type { AssembledContext } from "@diagram-4-llm/core";
import { describe, expect, it } from "vitest";

import {
  createOpenAICompatibleAdapter,
  listOpenAICompatibleModels,
} from "./openai-compatible";
import {
  collect,
  jsonBody,
  sse,
  streamedResponse,
  urlOf,
} from "./test-support/responses";
import type { ChatRequest } from "./types";

// Hand-written in the Chat Completions streaming format, as defined by the
// ChatCompletionChunk type of the official OpenAI SDK. Not recorded from a
// live server.
const chunk = (content: string | null, finishReason: string | null = null) =>
  JSON.stringify({
    id: "c1",
    object: "chat.completion.chunk",
    created: 0,
    model: "m",
    choices: [
      {
        index: 0,
        delta: content === null ? {} : { content },
        finish_reason: finishReason,
      },
    ],
  });
const usageChunk = JSON.stringify({
  id: "c1",
  object: "chat.completion.chunk",
  created: 0,
  model: "m",
  choices: [],
  usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
});

const context: AssembledContext = {
  system: "Be brief.",
  messages: [{ role: "user", content: "Hi" }],
  manifest: { entries: [], estimatedInputTokens: 2 },
};
const request: ChatRequest = { model: "llama3", context, params: {} };

function adapterReturning(
  response: Response | Error,
  calls: { url: string; init: RequestInit }[] = [],
) {
  return createOpenAICompatibleAdapter({
    baseUrl: "http://localhost:11434/v1/",
    fetch: (input, init) => {
      calls.push({ url: urlOf(input), init: init ?? {} });
      return response instanceof Error
        ? Promise.reject(response)
        : Promise.resolve(response);
    },
  });
}

describe("openai-compatible adapter", () => {
  it("streams text, then reports the stop reason and usage", async () => {
    const body = sse([
      chunk("Hel"),
      chunk("lo"),
      chunk(null, "stop"),
      usageChunk,
      "[DONE]",
    ]);
    const events = await collect(
      adapterReturning(streamedResponse(body, { chunkSizes: [7] })).stream(
        request,
        new AbortController().signal,
      ),
    );
    expect(events).toEqual([
      { type: "text", text: "Hel" },
      { type: "text", text: "lo" },
      {
        type: "done",
        stopReason: "end",
        usage: { inputTokens: 12, outputTokens: 3 },
      },
    ]);
  });

  it("sends the system prompt first and no output limit unless one is set", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    await collect(
      adapterReturning(streamedResponse(sse(["[DONE]"])), calls).stream(
        request,
        new AbortController().signal,
      ),
    );
    expect(calls[0]?.url).toBe("http://localhost:11434/v1/chat/completions");
    const sent = jsonBody(calls[0]?.init) as Record<string, unknown>;
    expect(sent).toEqual({
      model: "llama3",
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "Hi" },
      ],
      stream: true,
      stream_options: { include_usage: true },
    });
    expect(new Headers(calls[0]?.init.headers).has("authorization")).toBe(
      false,
    );
  });

  it("sends the API key, output limit and temperature when configured", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const adapter = createOpenAICompatibleAdapter({
      baseUrl: "https://api.example.com/v1",
      apiKey: "secret",
      fetch: (input, init) => {
        calls.push({ url: urlOf(input), init: init ?? {} });
        return Promise.resolve(streamedResponse(sse(["[DONE]"])));
      },
    });
    await collect(
      adapter.stream(
        { ...request, params: { maxOutputTokens: 100, temperature: 0.2 } },
        new AbortController().signal,
      ),
    );
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe(
      "Bearer secret",
    );
    expect(jsonBody(calls[0]?.init)).toMatchObject({
      max_tokens: 100,
      temperature: 0.2,
    });
  });

  it("maps a length finish to max-tokens", async () => {
    const events = await collect(
      adapterReturning(
        streamedResponse(sse([chunk("a", "length"), "[DONE]"])),
      ).stream(request, new AbortController().signal),
    );
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "max-tokens" });
  });

  it("reports an HTTP error with the server's message", async () => {
    const response = new Response(
      JSON.stringify({ error: { message: "model 'x' not found" } }),
      { status: 404 },
    );
    const events = await collect(
      adapterReturning(response).stream(request, new AbortController().signal),
    );
    expect(events).toEqual([
      {
        type: "error",
        error: { code: "http-404", message: "model 'x' not found" },
      },
    ]);
  });

  it("reports an error object sent inside the stream, keeping earlier text", async () => {
    const body = sse([
      chunk("partial"),
      JSON.stringify({ error: { message: "out of memory" } }),
    ]);
    const events = await collect(
      adapterReturning(streamedResponse(body)).stream(
        request,
        new AbortController().signal,
      ),
    );
    expect(events).toEqual([
      { type: "text", text: "partial" },
      {
        type: "error",
        error: { code: "provider-error", message: "out of memory" },
      },
    ]);
  });

  it("reports data that is not JSON", async () => {
    const events = await collect(
      adapterReturning(streamedResponse(sse(["not json"]))).stream(
        request,
        new AbortController().signal,
      ),
    );
    expect(events).toEqual([
      {
        type: "error",
        error: {
          code: "invalid-response",
          message: "Unexpected stream data: not json",
        },
      },
    ]);
  });

  it("reports a network failure", async () => {
    const events = await collect(
      adapterReturning(new TypeError("Failed to fetch")).stream(
        request,
        new AbortController().signal,
      ),
    );
    expect(events).toEqual([
      { type: "error", error: { code: "network", message: "Failed to fetch" } },
    ]);
  });

  it("reports cancellation as aborted, not as an error", async () => {
    const controller = new AbortController();
    controller.abort();
    const events = await collect(
      adapterReturning(
        new DOMException("The operation was aborted.", "AbortError"),
      ).stream(request, controller.signal),
    );
    expect(events).toEqual([{ type: "aborted" }]);
  });
});

describe("listOpenAICompatibleModels", () => {
  const signal = new AbortController().signal;

  it("reads model IDs from the list response and sends the key", async () => {
    let seen: { url: string; init: RequestInit | undefined } | undefined;
    const result = await listOpenAICompatibleModels(
      {
        baseUrl: "http://localhost:11434/v1/",
        apiKey: "secret",
        fetch: (input, init) => {
          seen = { url: urlOf(input), init };
          // The shape Ollama returns, including fields this code ignores.
          return Promise.resolve(
            new Response(
              JSON.stringify({
                object: "list",
                data: [
                  {
                    id: "llama3.2",
                    object: "model",
                    created: 1,
                    owned_by: "library",
                  },
                  {
                    id: "qwen3",
                    object: "model",
                    created: 2,
                    owned_by: "library",
                  },
                ],
              }),
            ),
          );
        },
      },
      signal,
    );
    expect(result).toEqual({ ok: true, value: ["llama3.2", "qwen3"] });
    expect(seen?.url).toBe("http://localhost:11434/v1/models");
    expect(new Headers(seen?.init?.headers).get("authorization")).toBe(
      "Bearer secret",
    );
  });

  it("reports an HTTP error with the server's message", async () => {
    const result = await listOpenAICompatibleModels(
      {
        baseUrl: "http://localhost:1234/v1",
        fetch: () =>
          Promise.resolve(new Response("not found", { status: 404 })),
      },
      signal,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "http-404" } });
  });

  it("rejects a response that is not a model list", async () => {
    const result = await listOpenAICompatibleModels(
      {
        baseUrl: "http://localhost:1234/v1",
        fetch: () =>
          Promise.resolve(new Response(JSON.stringify({ models: [] }))),
      },
      signal,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid-response" },
    });
  });

  it("reports an unreachable server, which is also how CORS failures appear", async () => {
    const result = await listOpenAICompatibleModels(
      {
        baseUrl: "http://localhost:1234/v1",
        fetch: () => Promise.reject(new TypeError("Failed to fetch")),
      },
      signal,
    );
    expect(result).toEqual({
      ok: false,
      error: { code: "network", message: "Failed to fetch" },
    });
  });
});
