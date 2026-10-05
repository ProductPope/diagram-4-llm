import react from "@vitejs/plugin-react";
import { defaultClientConditions } from "vite";
import { defineConfig, type Plugin } from "vitest/config";

/**
 * Model output and imported files are untrusted, and API keys live in the
 * browser (ADR 0002), so production builds ship a strict Content Security
 * Policy. Connections are limited to HTTPS endpoints and local model
 * servers. It is applied to builds only, because the dev server relies on
 * inline scripts for hot reloading.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: {
          "http-equiv": "Content-Security-Policy",
          content: CONTENT_SECURITY_POLICY,
        },
        injectTo: "head-prepend",
      },
    ],
  };
}

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  // Workspace packages expose their TypeScript sources under the "source"
  // condition, so the app uses them directly without building them first.
  resolve: { conditions: ["source", ...defaultClientConditions] },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
