// Drives the built desktop app through tauri-driver's WebDriver endpoint.
// `run.sh` starts the driver, a session bus and an unlocked keychain first.

const DRIVER = "http://127.0.0.1:4444";
const APP = process.env.DESKTOP_APP;
if (APP === undefined) throw new Error("Set DESKTOP_APP to the built app.");

/** A WebDriver response: the result, or an error in its place. */
interface Reply {
  readonly value: unknown;
}

async function call(
  method: "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(DRIVER + path, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const { value } = (await response.json()) as Reply;
  if (typeof value === "object" && value !== null && "error" in value)
    throw new Error(`${path}: ${JSON.stringify(value)}`);
  return value;
}

export interface App {
  /** Runs a script in the page and returns what it returns. */
  readonly run: (script: string) => Promise<unknown>;
  /** Runs a script until it returns something other than null or false. */
  readonly until: (script: string) => Promise<unknown>;
  readonly type: (selector: string, text: string) => Promise<void>;
  readonly click: (label: string) => Promise<unknown>;
}

/** Opens the app, runs `steps` against it and closes it again. */
export async function withApp(
  steps: (app: App) => Promise<void>,
): Promise<void> {
  const session = (await call("POST", "/session", {
    capabilities: { alwaysMatch: { "tauri:options": { application: APP } } },
  })) as { readonly sessionId: string };
  const path = (rest: string) => `/session/${session.sessionId}${rest}`;
  const run = (script: string) =>
    call("POST", path("/execute/sync"), { script, args: [] });
  const until = async (script: string) => {
    for (let tries = 0; tries < 50; tries += 1) {
      const value = await run(script);
      if (value !== null && value !== false) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for: ${script}`);
  };
  const type = async (selector: string, text: string) => {
    // The reply names the element under a key that differs by driver.
    const [element] = Object.values(
      (await call("POST", path("/element"), {
        using: "css selector",
        value: selector,
      })) as Record<string, string>,
    );
    if (element === undefined) throw new Error(`No element ${selector}`);
    await call("POST", path(`/element/${element}/clear`), {});
    // WebDriver refuses empty text; clearing is enough then.
    if (text !== "")
      await call("POST", path(`/element/${element}/value`), { text });
  };
  const click = (label: string) =>
    until(`const button = [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === ${JSON.stringify(label)});
      button?.click();
      return button !== undefined;`);
  try {
    await run(`location.hash = "#/app"`);
    await steps({ run, until, type, click });
  } finally {
    await call("DELETE", path(""));
  }
}
