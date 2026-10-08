import { describe, expect, it } from "vitest";

import { err, ok } from "@diagram-4-llm/core";

import {
  loadSettings,
  parseModelList,
  saveSettings,
  type KeyStore,
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
  it("round-trips saved settings", async () => {
    const storage = memoryStorage();
    const settings: ProviderSettings = {
      adapter: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "",
      models: ["llama3", "qwen3"],
      systemPrompt: "",
    };
    await saveSettings(settings, storage);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it("round-trips a model for node titles", async () => {
    const storage = memoryStorage();
    const settings: ProviderSettings = {
      adapter: "anthropic",
      apiKey: "k",
      models: ["claude-sonnet-5-5"],
      titleModel: "claude-haiku-4-5",
      systemPrompt: "",
    };
    await saveSettings(settings, storage);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it("round-trips a model for suggested branches", async () => {
    const storage = memoryStorage();
    const settings: ProviderSettings = {
      adapter: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "",
      models: ["llama3"],
      suggestionModel: "qwen3",
      systemPrompt: "",
    };
    await saveSettings(settings, storage);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it("round-trips context windows of models", async () => {
    const storage = memoryStorage();
    const settings: ProviderSettings = {
      adapter: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "",
      models: ["llama3", "qwen3"],
      contextWindows: { llama3: 8192 },
      systemPrompt: "",
    };
    await saveSettings(settings, storage);
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

  it("keeps the API key in the key store, apart from the settings", async () => {
    const storage = memoryStorage();
    const keyStore = memoryKeyStore();
    const settings: ProviderSettings = {
      adapter: "anthropic",
      apiKey: "sk-secret",
      models: ["claude-sonnet-5-5"],
      systemPrompt: "",
    };
    expect(await saveSettings(settings, storage, keyStore)).toEqual(
      ok(undefined),
    );
    expect(keyStore.key()).toBe("sk-secret");
    expect(storage.getItem("diagram-4-llm.provider-settings")).not.toContain(
      "sk-secret",
    );
    expect(loadSettings(storage, keyStore)).toEqual(settings);
  });

  it("saves nothing when the key store fails", async () => {
    const storage = memoryStorage();
    const keyStore: KeyStore = {
      key: () => null,
      save: () => Promise.resolve(err("The keychain is locked.")),
      problem: null,
    };
    const settings: ProviderSettings = {
      adapter: "anthropic",
      apiKey: "sk-secret",
      models: ["claude-sonnet-5-5"],
      systemPrompt: "",
    };
    expect(await saveSettings(settings, storage, keyStore)).toEqual(
      err("The keychain is locked."),
    );
    expect(storage.length).toBe(0);
  });

  it("asks again for an Anthropic key the key store no longer has", async () => {
    const storage = memoryStorage();
    await saveSettings(
      {
        adapter: "anthropic",
        apiKey: "sk-secret",
        models: ["claude-sonnet-5-5"],
        systemPrompt: "",
      },
      storage,
      memoryKeyStore(),
    );
    expect(loadSettings(storage, memoryKeyStore())).toBeNull();
  });
});

function memoryKeyStore(): KeyStore {
  let key: string | null = null;
  return {
    key: () => key,
    save: (next) => {
      key = next === "" ? null : next;
      return Promise.resolve(ok(undefined));
    },
    problem: null,
  };
}
