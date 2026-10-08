import { describe, expect, it } from "vitest";

import {
  loadSettings,
  parseModelList,
  saveSettings,
  type ProviderSettings,
} from "./settings";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => {
      values.clear();
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("provider settings", () => {
  it("round-trips saved settings", () => {
    const storage = memoryStorage();
    const settings: ProviderSettings = {
      adapter: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "",
      models: ["llama3", "qwen3"],
      systemPrompt: "",
    };
    saveSettings(settings, storage);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it("round-trips a model for node titles", () => {
    const storage = memoryStorage();
    const settings: ProviderSettings = {
      adapter: "anthropic",
      apiKey: "k",
      models: ["claude-sonnet-5-5"],
      titleModel: "claude-haiku-4-5",
      systemPrompt: "",
    };
    saveSettings(settings, storage);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it("round-trips context windows of models", () => {
    const storage = memoryStorage();
    const settings: ProviderSettings = {
      adapter: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "",
      models: ["llama3", "qwen3"],
      contextWindows: { llama3: 8192 },
      systemPrompt: "",
    };
    saveSettings(settings, storage);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it("treats a context window that is not a positive whole number as not configured", () => {
    const storage = memoryStorage();
    storage.setItem(
      "diagram-4-llm.provider-settings",
      JSON.stringify({
        adapter: "openai-compatible",
        baseUrl: "http://localhost:11434/v1",
        apiKey: "",
        models: ["llama3"],
        contextWindows: { llama3: 0 },
        systemPrompt: "",
      }),
    );
    expect(loadSettings(storage)).toBeNull();
  });

  it("reads settings saved with a single model as a list of one", () => {
    const storage = memoryStorage();
    storage.setItem(
      "diagram-4-llm.provider-settings",
      JSON.stringify({
        adapter: "anthropic",
        apiKey: "k",
        model: "claude-sonnet-5-5",
        systemPrompt: "",
      }),
    );
    expect(loadSettings(storage)).toEqual({
      adapter: "anthropic",
      apiKey: "k",
      models: ["claude-sonnet-5-5"],
      systemPrompt: "",
    });
  });

  it("parses one model per line, ignoring blank lines and surrounding spaces", () => {
    expect(parseModelList(" a \n\n b\n")).toEqual(["a", "b"]);
  });

  it("treats missing, unreadable or invalid settings as not configured", () => {
    const storage = memoryStorage();
    expect(loadSettings(storage)).toBeNull();
    storage.setItem("diagram-4-llm.provider-settings", "{not json");
    expect(loadSettings(storage)).toBeNull();
    storage.setItem(
      "diagram-4-llm.provider-settings",
      JSON.stringify({ adapter: "anthropic", model: "m" }),
    );
    expect(loadSettings(storage)).toBeNull();
  });
});
