import type {
  AdapterId,
  AssembledContext,
  GenerationParams,
  ProviderErrorInfo,
  TokenUsage,
} from "@diagram-4-llm/core";

export interface ChatRequest {
  readonly model: string;
  readonly context: AssembledContext;
  readonly params: GenerationParams;
}

/** Why the model stopped, normalised across providers. */
export type StopReason = "end" | "max-tokens" | "refusal" | "other";

/**
 * Events of one streamed answer. A stream yields any number of `text`
 * events and then exactly one terminal event (`done`, `aborted` or
 * `error`). Streams never throw: expected failures arrive as `error`.
 */
export type StreamEvent =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "done";
      readonly stopReason: StopReason;
      readonly usage?: TokenUsage;
    }
  | { readonly type: "aborted"; readonly usage?: TokenUsage }
  | { readonly type: "error"; readonly error: ProviderErrorInfo };

export interface ProviderAdapter {
  readonly id: AdapterId;
  stream(request: ChatRequest, signal: AbortSignal): AsyncIterable<StreamEvent>;
}
