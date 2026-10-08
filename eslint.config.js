import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "**/dist/",
    "**/coverage/",
    "**/test-results/",
    "**/playwright-report/",
    "**/target/",
    // The Claude Code mod is typed against declarations that Claude Code
    // writes when it loads the mod, so the repository's type-aware lint
    // cannot resolve them. `pnpm --filter @diagram-4-llm/mcp test:plugin`
    // checks it with Claude Code's own validator and test runner instead.
    "packages/mcp/plugin/",
  ]),
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
    },
  },
  {
    // ADR 0004: the core package is pure. These rules make the boundary
    // mechanical rather than a convention.
    files: ["packages/core/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", "fs", "path", "os", "crypto"],
              message: "packages/core performs no I/O.",
            },
            {
              group: ["react", "react-dom", "@xyflow/*", "dexie", "zustand"],
              message: "packages/core has no UI or storage dependencies.",
            },
            {
              group: ["**/apps/**", "@diagram-4-llm/web"],
              message: "packages/core must not depend on apps.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        ...[
          "fetch",
          "window",
          "document",
          "localStorage",
          "sessionStorage",
          "indexedDB",
          "crypto",
          "setTimeout",
          "setInterval",
          "process",
        ].map((name) => ({
          name,
          message: "packages/core performs no I/O and has no hidden state.",
        })),
        { name: "Date", message: "Timestamps are supplied by the caller." },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "IDs and randomness are supplied by the caller.",
        },
      ],
    },
  },
  {
    // The web app splits browser code and Node.js tooling into two
    // TypeScript projects, which the project service does not discover.
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ["apps/web/tsconfig.json", "apps/web/tsconfig.node.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
