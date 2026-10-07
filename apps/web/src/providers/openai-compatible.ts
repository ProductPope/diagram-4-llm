import type {
  ProviderErrorInfo,
  Result,
  StopReason,
  TokenUsage,
} from "@diagram-4-llm/core";

import { readServerSentEvents } from "./sse";
import type { ChatRequest, ProviderAdapter, StreamEvent } from "./types";

export interface OpenAICompatibleConfig {
  /** For example `http://localhost:11434/v1` for Ollama. */
  readonly baseUrl: string;
  /** Sent as a bearer token when set. Local servers usually need none. */
  readonly apiKey?: string;
  /** Injected in tests. Defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
}

/**
 * Adapter for servers that implement the OpenAI Chat Completions streaming
 * format (Ollama, LM Studio, llama.cpp server, vLLM and hosted services).
 * It uses `fetch` directly rather than an SDK, because no single SDK
 * targets "compatible" servers (ADR 0005).
 */
export function createOpenAICompatibleAdapter(
  config: OpenAICompatibleConfig,
): ProviderAdapter {
  const doFetch = config.fetch ?? globalThis.fetch.bind(globalThis);
  return {
    id: "openai-compatible",
    stream: (request, signal) =>
      streamCompletion(doFetch, config, request, signal),
  };
}

/**
 * The IDs of the models the server offers (`GET /models`, which Ollama, LM
 * Studio and the OpenAI API implement), for choosing models during setup.
 * A successful call also confirms that the server is reachable from the
 * browser, which includes its CORS settings.
 */
export async function listOpenAICompatibleModels(
  config: OpenAICompatibleConfig,
  signal: AbortSignal,
): Promise<Result<string[], ProviderErrorInfo>> {
  const doFetch = config.fetch ?? globalThis.fetch.bind(globalThis);
  let response: Response;
  try {
    response = await doFetch(endpoint(config, "models"), {
      headers: authorization(config),
      signal,
    });
  } catch (error) {
    return {
      ok: false,
      error: signal.aborted
        ? { code: "aborted", message: "The request was cancelled." }
        : {
            code: "network",
            message: error instanceof Error ? error.message : String(error),
          },
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: {
        code: `http-${String(response.status)}`,
        message: await errorMessage(response),
      },
    };
  }
  const ids = modelIds(await response.json().catch(() => null));
  return ids === null
    ? {
        ok: false,
        error: {
          code: "invalid-response",
          message: "The server's model list is not in the expected format.",
        },
      }
    : { ok: true, value: ids };
}

/** Reads `data[].id` from a list response, ignoring other fields. */
function modelIds(value: unknown): string[] | null {
  if (!isRecord(value) || !Array.isArray(value.data)) return null;
  const ids: string[] = [];
  for (const model of value.data as unknown[]) {
    if (!isRecord(model) || typeof model.id !== "string") return null;
    ids.push(model.id);
  }
  return ids;
}

function endpoint(config: OpenAICompatibleConfig, path: string): string {
  return `${config.baseUrl.replace(/\/+$/, "")}/${path}`;
}

function authorization(config: OpenAICompatibleConfig): Record<string, string> {
  return config.apiKey === undefined
    ? {}
    : { authorization: `Bearer ${config.apiKey}` };
}

async function* streamCompletion(
  doFetch: typeof fetch,
  config: OpenAICompatibleConfig,
  request: ChatRequest,
  signal: AbortSignal,
): AsyncGenerator<StreamEvent> {
  let usage: TokenUsage | undefined;
  let stopReason: StopReason = "other";

  try {
    const response = await doFetch(endpoint(config, "chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authorization(config),
      },
      body: JSON.stringify(requestBody(request)),
      signal,
    });

    if (!response.ok) {
      yield {
        type: "error",
        error: {
          code: `http-${String(response.status)}`,
          message: await errorMessage(response),
        },
      };
      return;
    }
    if (response.body === null) {
      yield {
        type: "error",
        error: {
          code: "empty-response",
          message: "The server returned no body.",
        },
      };
      return;
    }

    for await (const data of readServerSentEvents(response.body)) {
      if (data === "[DONE]") break;
      const chunk = parseChunk(data);
      if (chunk === null) {
        yield {
          type: "error",
          error: {
            code: "invalid-response",
            message: `Unexpected stream data: ${data.slice(0, 200)}`,
          },
        };
        return;
      }
      if (chunk.error !== undefined) {
        yield {
          type: "error",
          error: { code: "provider-error", message: chunk.error },
        };
        return;
      }
      if (chunk.text !== "") yield { type: "text", text: chunk.text };
      if (chunk.finishReason !== null)
        stopReason = mapFinishReason(chunk.finishReason);
      if (chunk.usage !== undefined) usage = chunk.usage;
    }
  } catch (error) {
    if (signal.aborted) {
      yield usage === undefined
        ? { type: "aborted" }
        : { type: "aborted", usage };
      return;
    }
    yield {
      type: "error",
      error: {
        code: "network",
        message: error instanceof Error ? error.message : String(error),
      },
    };
    return;
  }

  yield usage === undefined
    ? { type: "done", stopReason }
    : { type: "done", stopReason, usage };
}

function requestBody(request: ChatRequest) {
  const { context, params } = request;
  return {
    model: request.model,
    messages: [
      ...(context.system === null
        ? []
        : [{ role: "system", content: context.system }]),
      ...context.messages,
    ],
    stream: true,
    stream_options: { include_usage: true },
    // Without an explicit limit the server applies its own. A default here
    // could exceed a small local model's context window, which some
    // servers reject.
    ...(params.maxOutputTokens === undefined
      ? {}
      : { max_tokens: params.maxOutputTokens }),
    ...(params.temperature === undefined
      ? {}
      : { temperature: params.temperature }),
  };
}

interface ParsedChunk {
  readonly text: string;
  readonly finishReason: string | null;
  readonly usage?: TokenUsage;
  readonly error?: string;
}

/**
 * Extracts the fields this adapter uses. Servers differ in which optional
 * fields they send, so this checks only what it reads instead of
 * validating the whole chunk.
 */
function parseChunk(data: string): ParsedChunk | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;

  if (isRecord(value.error)) {
    const message = value.error.message;
    return {
      text: "",
      finishReason: null,
      error:
        typeof message === "string" ? message : JSON.stringify(value.error),
    };
  }

  const choice = Array.isArray(value.choices)
    ? (value.choices[0] as unknown)
    : undefined;
  const delta =
    isRecord(choice) && isRecord(choice.delta) ? choice.delta : undefined;
  const text = typeof delta?.content === "string" ? delta.content : "";
  const finishReason =
    isRecord(choice) && typeof choice.finish_reason === "string"
      ? choice.finish_reason
      : null;

  const usage = isRecord(value.usage) ? value.usage : undefined;
  const parsedUsage =
    typeof usage?.prompt_tokens === "number" &&
    typeof usage.completion_tokens === "number"
      ? {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
        }
      : undefined;

  return parsedUsage === undefined
    ? { text, finishReason }
    : { text, finishReason, usage: parsedUsage };
}

function mapFinishReason(reason: string): StopReason {
  switch (reason) {
    case "stop":
      return "end";
    case "length":
      return "max-tokens";
    case "content_filter":
      return "refusal";
    default:
      return "other";
  }
}

async function errorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      isRecord(parsed) &&
      isRecord(parsed.error) &&
      typeof parsed.error.message === "string"
    ) {
      return parsed.error.message;
    }
  } catch {
    // Not JSON: fall back to the raw text below.
  }
  return text === "" ? response.statusText : text.slice(0, 500);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
