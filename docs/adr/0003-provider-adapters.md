# 0003. Two provider adapters: Anthropic and OpenAI-compatible

Status: Accepted
Date: 2026-10-05

## Context

The first user works with Claude and plans to run local models. Local model
servers (Ollama, LM Studio, llama.cpp server, vLLM) expose an
OpenAI-compatible Chat Completions endpoint, as do many hosted services.
Every adapter is code that must be maintained and tested against a moving
external API.

## Decision

Implement exactly two adapters behind a common interface:

- `anthropic`, for the Anthropic Messages API,
- `openai-compatible`, configured with a base URL, for everything else.

The interface accepts the assembled messages and returns a stream of events:
text delta, usage, finish, and error. How each adapter is implemented is
decided in [ADR 0005](0005-adapter-implementation.md).

## Alternatives considered

- **One adapter per vendor.** More precise, but the maintenance cost grows
  with each provider and duplicates what the compatible format already
  covers.
- **OpenAI-compatible only.** Anthropic offers a compatibility layer, but
  using the native API keeps access to its own features and error semantics.

## Consequences

- Provider-specific features beyond plain text chat (tool use, images,
  extended reasoning output) are out of scope until a phase explicitly adds
  them.
- Adapter behaviour is tested with recorded fixtures, so CI needs no API
  keys or network access.
