import { ok, type ProviderErrorInfo, type Result } from "@diagram-4-llm/core";
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
/** Suggests follow-up questions under answers when set; off without it. */
const suggestionModel = z.exactOptional(z.string().min(1));
/**
 * Context window in tokens of the models the user gave one for. Providers
 * do not report it in a form common to both APIs, so the user enters it;
 * without it, the app cannot warn before a context is too large.
 */
const contextWindows = z.exactOptional(
  z.record(z.string().min(1), z.number().int().positive()),
);

const settingsSchema = z.discriminatedUnion("adapter", [
  z.strictObject({
    adapter: z.literal("anthropic"),
    apiKey: z.string().min(1),
    models: modelList,
    titleModel,
    suggestionModel,
    contextWindows,
    systemPrompt: z.string(),
  }),
  z.strictObject({
    adapter: z.literal("openai-compatible"),
    baseUrl: z.url(),
    apiKey: z.string(),
    models: modelList,
    titleModel,
    suggestionModel,
    contextWindows,
    systemPrompt: z.string(),
  }),
]);

export type ProviderSettings = z.infer<typeof settingsSchema>;

const STORAGE_KEY = "diagram-4-llm.provider-settings";

/**
 * Where the API key is kept apart from the other settings: the operating
 * system's keychain in the desktop app (ADR 0014). A browser has no such
 * store, so there the key is saved with the other settings.
 */
export interface KeyStore {
  /** The key saved last, or null when none is saved. */
  readonly key: () => string | null;
  readonly save: (key: string) => Promise<Result<void, string>>;
  /** Why the saved key could not be read when the app started. */
  readonly problem: string | null;
}

/**
 * Reads the saved provider settings. Settings that are missing, unreadable or
 * no longer valid count as not configured, so the user is asked again
 * instead of the app sending requests with half a configuration.
 */
export function loadSettings(
  storage: Storage = localStorage,
  keyStore: KeyStore | null = null,
): ProviderSettings | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  try {
    const saved = upgradeSavedSettings(JSON.parse(raw));
    const parsed = settingsSchema.safeParse(
      keyStore === null || typeof saved !== "object" || saved === null
        ? saved
        : { ...saved, apiKey: keyStore.key() ?? "" },
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Saves the settings, the API key in the key store when there is one. If the
 * key cannot be saved, nothing is, so that the settings saved before still
 * match the key saved with them.
 */
export async function saveSettings(
  settings: ProviderSettings,
  storage: Storage = localStorage,
  keyStore: KeyStore | null = null,
): Promise<Result<void, string>> {
  if (keyStore === null) {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return ok(undefined);
  }
  const saved = await keyStore.save(settings.apiKey);
  if (!saved.ok) return saved;
  // JSON leaves out undefined values, so the key is not written.
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...settings, apiKey: undefined }),
  );
  return ok(undefined);
}

/**
 * What the desktop app adds to the web app (ADR 0014, ADR 0015). The
 * browser version has neither.
 */
export interface Desktop {
  readonly keyStore: KeyStore;
  /**
   * Makes requests from the desktop app rather than the page, so that
   * OpenAI-compatible servers need no CORS setup. Anthropic allows the page
   * to call it directly, so its requests stay in the page.
   */
  readonly serverFetch: typeof fetch;
}

export function createAdapter(
  settings: ProviderSettings,
  serverFetch: typeof fetch | null = null,
): ProviderAdapter {
  return settings.adapter === "anthropic"
    ? createAnthropicAdapter({ apiKey: settings.apiKey })
    : createOpenAICompatibleAdapter({
        baseUrl: settings.baseUrl,
        ...(settings.apiKey === "" ? {} : { apiKey: settings.apiKey }),
        ...(serverFetch === null ? {} : { fetch: serverFetch }),
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
  serverFetch: typeof fetch | null = null,
): Promise<Result<string[], ProviderErrorInfo>> {
  return connection.adapter === "anthropic"
    ? listAnthropicModels({ apiKey: connection.apiKey }, signal)
    : listOpenAICompatibleModels(
        {
          baseUrl: connection.baseUrl,
          ...(connection.apiKey === "" ? {} : { apiKey: connection.apiKey }),
          ...(serverFetch === null ? {} : { fetch: serverFetch }),
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
