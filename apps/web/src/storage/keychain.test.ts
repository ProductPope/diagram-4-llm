import { err, ok } from "@diagram-4-llm/core";
import { describe, expect, it } from "vitest";

import { openKeychain, type Invoke } from "./keychain";

/** The desktop app's commands over one saved key, as in `lib.rs`. */
function fakeDesktop(saved: string | null): {
  readonly invoke: Invoke;
  readonly saved: () => string | null;
} {
  let key = saved;
  return {
    invoke: (command, args) => {
      if (command === "load_api_key") return Promise.resolve(key);
      const next = args?.key;
      if (command === "save_api_key" && typeof next === "string") {
        key = next === "" ? null : next;
        return Promise.resolve(null);
      }
      return Promise.reject(new Error(`Unknown command ${command}`));
    },
    saved: () => key,
  };
}

describe("desktop keychain", () => {
  it("reads the saved key at start and saves a new one", async () => {
    const desktop = fakeDesktop("sk-old");
    const keychain = await openKeychain(desktop.invoke);
    expect(keychain.problem).toBeNull();
    expect(keychain.key()).toBe("sk-old");
    expect(await keychain.save("sk-new")).toEqual(ok(undefined));
    expect(keychain.key()).toBe("sk-new");
    expect(desktop.saved()).toBe("sk-new");
    expect(await keychain.save("")).toEqual(ok(undefined));
    expect(keychain.key()).toBeNull();
    expect(desktop.saved()).toBeNull();
  });

  it("reports a keychain it cannot read and keeps the key it has on failure", async () => {
    const keychain = await openKeychain((command) =>
      Promise.reject(
        new Error(command === "load_api_key" ? "No secret service" : "Locked"),
      ),
    );
    expect(keychain.problem).toBe(
      "The API key could not be read from the keychain: No secret service",
    );
    expect(keychain.key()).toBeNull();
    expect(await keychain.save("sk-new")).toEqual(err("Locked"));
    expect(keychain.key()).toBeNull();
  });
});
