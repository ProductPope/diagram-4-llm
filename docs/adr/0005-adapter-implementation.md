# 0005. Anthropic adapter on the official SDK, OpenAI-compatible adapter on fetch

Status: Accepted
Date: 2026-10-05

## Context

ADR 0003 left open whether the adapters should use SDKs or direct HTTP
calls. The two adapters face different situations:

- Anthropic publishes an official TypeScript SDK that supports browsers
  through an explicit opt-in, handles streaming, typed errors and retries,
  and tracks API changes. Anthropic's guidance is to use the SDK in
  TypeScript projects rather than raw HTTP.
- "OpenAI-compatible" is a family of servers (Ollama, LM Studio,
  llama.cpp server, vLLM, hosted services) that implement the same
  streaming format with small differences. The official OpenAI SDK targets
  OpenAI's own API, has an unpacked size of about 20 MB and declares peer
  dependencies irrelevant to a browser app.

## Decision

- The `anthropic` adapter wraps `@anthropic-ai/sdk`.
- The `openai-compatible` adapter calls `POST {baseUrl}/chat/completions`
  with `fetch` and reads the stream with a small server-sent events reader.
  It reads only the fields it needs from each chunk, so optional fields
  that servers add or omit do not break it. The chunk format was checked
  against the `ChatCompletionChunk` type of the official OpenAI SDK.
- Both adapters expose the same interface: an async iterable of events
  that never throws. It yields text deltas and then exactly one terminal
  event: `done` (with a normalised stop reason and usage), `aborted` or
  `error`.
- The `openai-compatible` adapter sends no output limit unless the user sets
  one, because a default could exceed a small local model's context window.
  The Messages API requires a limit, so the `anthropic` adapter uses 64,000
  tokens by default.

## Alternatives considered

- **Both on direct HTTP.** Fewer dependencies, but it reimplements error
  handling and protocol details that the Anthropic SDK maintains.
- **Both on SDKs.** The OpenAI SDK is large, assumes OpenAI's own API, and
  would not remove the need to handle differences between compatible
  servers.
- **A multi-provider SDK.** One more abstraction layer between the app and
  the providers, with its own release cycle, for two adapters.

## Consequences

- The SSE reader and the compatible adapter are project code, so they have
  their own tests, including a property-based test that splits streams into
  arbitrary chunks.
- Adapter tests use hand-written responses in the documented formats, not
  recordings of live services. They prove the parsing and error mapping,
  not compatibility with a particular server version.
