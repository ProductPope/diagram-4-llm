// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createAnthropicAdapter, listAnthropicModels } from "./anthropic";
import { collect } from "./test-support/responses";

// The SDK is loaded on first use, so a failed download of its chunk (the
// user went offline, or a deploy replaced it) reaches the adapter.
vi.mock("@anthropic-ai/sdk", () => {
  throw new Error("Failed to fetch dynamically imported module");
});

const fail = () => Promise.reject(new Error("The SDK should not be reached."));

describe("Anthropic adapter when its SDK cannot be loaded", () => {
  it("ends the stream with a network error", async () => {
    const adapter = createAnthropicAdapter({ apiKey: "key", fetch: fail });
    const events = await collect(
      adapter.stream(
        {
          model: "claude-opus-5-5",
          context: {
            system: null,
            messages: [{ role: "user", content: "Hi" }],
          },
          params: {},
        },
        new AbortController().signal,
      ),
    );
    expect(events).toEqual([
      {
        type: "error",
        error: {
          code: "network",
          message: expect.stringContaining(
            "The Anthropic client could not be loaded",
          ) as unknown,
        },
      },
    ]);
  });

  it("reports a network error instead of models", async () => {
    const result = await listAnthropicModels(
      { apiKey: "key", fetch: fail },
      new AbortController().signal,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "network" } });
  });
});
