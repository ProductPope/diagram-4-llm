import type Anthropic from "@anthropic-ai/sdk";
import type * as AnthropicSdk from "@anthropic-ai/sdk";
import type {
  ProviderErrorInfo,
  Result,
  StopReason,
  TokenUsage,
} from "@diagram-4-llm/core";

import type { ChatRequest, ProviderAdapter, StreamEvent } from "./types";

/**
 * The Messages API requires an output limit. Answers are streamed, so a
 * high ceiling does not risk HTTP timeouts.
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 64_000;

export interface AnthropicConfig {
  readonly apiKey: string;
  /** Injected in tests. Defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
}

/** Adapter for the Anthropic Messages API, built on the official SDK (ADR 0005). */
export function createAnthropicAdapter(
  config: AnthropicConfig,
): ProviderAdapter {
  return {
    id: "anthropic",
    stream: async function* (request, signal) {
      const sdk = await loadSdk();
      if (!sdk.ok) {
        yield { type: "error", error: sdk.error };
        return;
      }
      yield* streamMessage(
        sdk.value,
        createClient(sdk.value, config),
        request,
        signal,
      );
    },
  };
}

/**
 * The IDs of the models the key can use, for choosing models during setup.
 * A successful call also confirms that the key works.
 */
export async function listAnthropicModels(
  config: AnthropicConfig,
  signal: AbortSignal,
): Promise<Result<string[], ProviderErrorInfo>> {
  const sdk = await loadSdk();
  if (!sdk.ok) return sdk;
  const ids: string[] = [];
  try {
    // The page iterator requests further pages as it goes.
    for await (const model of createClient(sdk.value, config).models.list(
      { limit: 100 },
      { signal },
    )) {
      ids.push(model.id);
    }
    return { ok: true, value: ids };
  } catch (error) {
    return { ok: false, error: toProviderError(sdk.value, error, signal) };
  }
}

/**
 * The SDK is about a sixth of the app's code and is needed only once the
 * user talks to Anthropic, so it is loaded on first use, not with the page.
 */
async function loadSdk(): Promise<
  Result<typeof AnthropicSdk, ProviderErrorInfo>
> {
  try {
    return { ok: true, value: await import("@anthropic-ai/sdk") };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "network",
        message: `The Anthropic client could not be loaded: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    };
  }
}

function createClient(
  sdk: typeof AnthropicSdk,
  config: AnthropicConfig,
): Anthropic {
  return new sdk.default({
    apiKey: config.apiKey,
    // ADR 0002: the app runs entirely in the browser with the user's own
    // key. The README states the risk of keeping a key in the browser.
    dangerouslyAllowBrowser: true,
    ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
  });
}

async function* streamMessage(
  sdk: typeof AnthropicSdk,
  client: Anthropic,
  request: ChatRequest,
  signal: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const { context, params } = request;
  const stream = client.messages.stream(
    {
      model: request.model,
      max_tokens: params.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      messages: context.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      ...(context.system === null ? {} : { system: context.system }),
      ...(params.temperature === undefined
        ? {}
        : { temperature: params.temperature }),
    },
    { signal },
  );

  try {
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { type: "text", text: event.delta.text };
      }
    }
    const message = await stream.finalMessage();
    yield {
      type: "done",
      stopReason: mapStopReason(message.stop_reason),
      usage: toUsage(message.usage),
    };
  } catch (error) {
    if (signal.aborted) {
      yield { type: "aborted" };
    } else {
      yield { type: "error", error: toProviderError(sdk, error, signal) };
    }
  }
}

function toProviderError(
  sdk: typeof AnthropicSdk,
  error: unknown,
  signal: AbortSignal,
): ProviderErrorInfo {
  if (signal.aborted)
    return { code: "aborted", message: "The request was cancelled." };
  if (error instanceof sdk.APIConnectionError)
    return { code: "network", message: error.message };
  if (error instanceof sdk.APIError)
    return {
      code: error.type ?? `http-${String(error.status ?? "unknown")}`,
      message: error.message,
    };
  return {
    code: "unexpected",
    message: error instanceof Error ? error.message : String(error),
  };
}

function mapStopReason(reason: Anthropic.StopReason | null): StopReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "end";
    case "max_tokens":
    case "model_context_window_exceeded":
      return "max-tokens";
    case "refusal":
      return "refusal";
    case "tool_use":
    case "pause_turn":
    case null:
      return "other";
  }
}

/** Input tokens include cached ones, which the API reports separately. */
function toUsage(usage: Anthropic.Usage): TokenUsage {
  return {
    inputTokens:
      usage.input_tokens +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0),
    outputTokens: usage.output_tokens,
  };
}
