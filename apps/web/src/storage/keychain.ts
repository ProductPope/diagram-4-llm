import { err, ok } from "@diagram-4-llm/core";
import { z } from "zod";

import type { KeyStore } from "../app/settings";

/** Calls a command of the desktop app, as Tauri's `invoke` does. */
export type Invoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

/**
 * The desktop app's keychain, reached through the commands in
 * `apps/desktop/src-tauri/src/lib.rs`. The saved key is read once, at start,
 * so that settings can be read synchronously like the browser's storage.
 */
export async function openKeychain(invoke: Invoke): Promise<KeyStore> {
  let key: string | null = null;
  let problem: string | null = null;
  try {
    const loaded = z
      .string()
      .nullable()
      .safeParse(await invoke("load_api_key"));
    if (loaded.success) key = loaded.data;
    else problem = "The keychain returned something other than a key.";
  } catch (reason) {
    problem = `The API key could not be read from the keychain: ${messageOf(reason)}`;
  }
  return {
    key: () => key,
    save: async (next) => {
      try {
        await invoke("save_api_key", { key: next });
      } catch (reason) {
        return err(messageOf(reason));
      }
      key = next === "" ? null : next;
      return ok(undefined);
    },
    problem,
  };
}

// The desktop app's commands reject with their error as a string.
function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
