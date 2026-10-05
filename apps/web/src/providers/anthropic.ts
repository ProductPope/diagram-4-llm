import Anthropic from "@anthropic-ai/sdk";
import type { TokenUsage } from "@diagram-4-llm/core";

import type {
  ChatRequest,
  ProviderAdapter,
  StopReason,
  StreamEvent,
} from "./types";

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
  const client = new Anthropic({
    apiKey: config.apiKey,
    // ADR 0002: the app runs entirely in the browser with the user's own
    // key. The README states the risk of keeping a key in the browser.
    dangerouslyAllowBrowser: true,
    ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
  });
  return {
    id: "anthropic",
    stream: (request, signal) => streamMessage(client, request, signal),
  };
}

async function* streamMessage(
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
    } else if (error instanceof Anthropic.APIConnectionError) {
      yield {
        type: "error",
        error: { code: "network", message: error.message },
      };
    } else if (error instanceof Anthropic.APIError) {
      yield {
        type: "error",
        error: {
          code: error.type ?? `http-${String(error.status ?? "unknown")}`,
          message: error.message,
        },
      };
    } else {
      yield {
        type: "error",
        error: {
          code: "unexpected",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
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
