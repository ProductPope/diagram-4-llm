import { z } from "zod";

import { createAnthropicAdapter } from "../providers/anthropic";
import { createOpenAICompatibleAdapter } from "../providers/openai-compatible";
import type { ProviderAdapter } from "../providers/types";

/** Models offered when sending; the first is the default for new branches. */
const modelList = z.array(z.string().min(1)).min(1);

const settingsSchema = z.discriminatedUnion("adapter", [
  z.strictObject({
    adapter: z.literal("anthropic"),
    apiKey: z.string().min(1),
    models: modelList,
    systemPrompt: z.string(),
  }),
  z.strictObject({
    adapter: z.literal("openai-compatible"),
    baseUrl: z.url(),
    apiKey: z.string(),
    models: modelList,
    systemPrompt: z.string(),
  }),
]);

export type ProviderSettings = z.infer<typeof settingsSchema>;

const STORAGE_KEY = "diagram-4-llm.provider-settings";

/**
 * Reads the saved provider settings. Settings that are missing, unreadable or
 * no longer valid count as not configured, so the user is asked again
 * instead of the app sending requests with half a configuration.
 */
export function loadSettings(
  storage: Storage = localStorage,
): ProviderSettings | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed = settingsSchema.safeParse(
      upgradeSavedSettings(JSON.parse(raw)),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveSettings(
  settings: ProviderSettings,
  storage: Storage = localStorage,
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function createAdapter(settings: ProviderSettings): ProviderAdapter {
  return settings.adapter === "anthropic"
    ? createAnthropicAdapter({ apiKey: settings.apiKey })
    : createOpenAICompatibleAdapter({
        baseUrl: settings.baseUrl,
        ...(settings.apiKey === "" ? {} : { apiKey: settings.apiKey }),
      });
}

/**
 * Settings saved before several models were supported have a single `model`.
 * They are read as a list of one, so existing users keep their configuration.
 */
function upgradeSavedSettings(value: unknown): unknown {
  if (
    typeof value !== "object" ||
    value === null ||
    !("model" in value) ||
    "models" in value
  ) {
    return value;
  }
  const { model, ...rest } = value;
  return { ...rest, models: [model] };
}

/** Parses the models field of the settings form: one model per line. */
export function parseModelList(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
