import type { ProviderErrorInfo, Result } from "@diagram-4-llm/core";
import { z } from "zod";

import {
  createAnthropicAdapter,
  listAnthropicModels,
} from "../providers/anthropic";
import {
  createOpenAICompatibleAdapter,
  listOpenAICompatibleModels,
} from "../providers/openai-compatible";
import type { ProviderAdapter } from "../providers/types";

/** Models offered when sending; the first is the default for new branches. */
const modelList = z.array(z.string().min(1)).min(1);
/** Titles map nodes when set; without it nodes show the start of a message. */
const titleModel = z.exactOptional(z.string().min(1));

const settingsSchema = z.discriminatedUnion("adapter", [
  z.strictObject({
    adapter: z.literal("anthropic"),
    apiKey: z.string().min(1),
    models: modelList,
    titleModel,
    systemPrompt: z.string(),
  }),
  z.strictObject({
    adapter: z.literal("openai-compatible"),
    baseUrl: z.url(),
    apiKey: z.string(),
    models: modelList,
    titleModel,
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

/** Where answers come from, before any models are chosen. */
export type Connection =
  | { readonly adapter: "anthropic"; readonly apiKey: string }
  | {
      readonly adapter: "openai-compatible";
      readonly baseUrl: string;
      readonly apiKey: string;
    };

/** The models a connection offers; a successful result confirms it works. */
export function listModels(
  connection: Connection,
  signal: AbortSignal,
): Promise<Result<string[], ProviderErrorInfo>> {
  return connection.adapter === "anthropic"
    ? listAnthropicModels({ apiKey: connection.apiKey }, signal)
    : listOpenAICompatibleModels(
        {
          baseUrl: connection.baseUrl,
          ...(connection.apiKey === "" ? {} : { apiKey: connection.apiKey }),
        },
        signal,
      );
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
