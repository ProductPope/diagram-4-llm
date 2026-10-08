import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // Tests use the core's TypeScript sources, as the web app does, so the
  // core does not have to be built first. An alias rather than the "source"
  // condition, which some of the MCP SDK's dependencies also define.
  resolve: {
    alias: {
      "@diagram-4-llm/core": fileURLToPath(
        new URL("../core/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
