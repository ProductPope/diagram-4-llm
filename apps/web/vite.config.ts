import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defaultClientConditions, defaultServerConditions } from "vite";
import { defineConfig, type Plugin } from "vitest/config";

/**
 * Model output and imported files are untrusted, and API keys live in the
 * browser (ADR 0002), so production builds ship a strict Content Security
 * Policy. Connections are limited to HTTPS endpoints and local model
 * servers. It is applied to builds only, because the dev server relies on
 * inline scripts for hot reloading. The desktop build (`--mode desktop`)
 * also allows Tauri's IPC, which the page uses to reach the keychain.
 */
function contentSecurityPolicyFor(mode: string): string {
  const ipc = mode === "desktop" ? " ipc: http://ipc.localhost" : "";
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' https: http://localhost:* http://127.0.0.1:*${ipc}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

function contentSecurityPolicy(mode: string): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: {
          "http-equiv": "Content-Security-Policy",
          content: contentSecurityPolicyFor(mode),
        },
        injectTo: "head-prepend",
      },
    ],
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), contentSecurityPolicy(mode)],
  // Workspace packages expose their TypeScript sources under the "source"
  // condition, so the app uses them directly without building them first.
  // Tests in the Node environment resolve with the server conditions.
  resolve: { conditions: ["source", ...defaultClientConditions] },
  ssr: { resolve: { conditions: ["source", ...defaultServerConditions] } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
}));
