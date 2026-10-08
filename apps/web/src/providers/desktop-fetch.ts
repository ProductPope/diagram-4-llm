import { fetch as pluginFetch } from "@tauri-apps/plugin-http";

/**
 * `fetch` made by the desktop app instead of the page, so the server's CORS
 * settings do not apply. The app would send `tauri://localhost` or
 * `http://tauri.localhost` as the Origin, which servers such as Ollama
 * check against a list; an empty Origin makes it send none, as other local
 * clients do (ADR 0015).
 */
export const desktopFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set("origin", "");
  return pluginFetch(input, { ...init, headers });
};
