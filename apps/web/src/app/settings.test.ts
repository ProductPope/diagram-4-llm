import { describe, expect, it } from "vitest";

import { loadSettings, saveSettings } from "./settings";

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
    const settings = {
      adapter: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "",
      model: "llama3",
      systemPrompt: "",
    } as const;
    saveSettings(settings, storage);
    expect(loadSettings(storage)).toEqual(settings);
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
