import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["**/dist/", "**/coverage/"]),
  js.configs.recommended,
  {
    files: ["**/*.ts"],
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
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
