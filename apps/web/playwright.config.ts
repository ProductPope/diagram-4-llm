import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: process.env.CI !== undefined,
  reporter: process.env.CI === undefined ? "list" : "github",
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Lets environments with a preinstalled Chromium of another revision
        // run the suite. CI installs the matching browser and leaves it unset.
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE === undefined
          ? {}
          : {
              launchOptions: {
                executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
              },
            }),
      },
    },
  ],
  // End-to-end tests run against the production build, so the Content
  // Security Policy is part of what they test.
  webServer: {
    command: `pnpm build && pnpm preview --host 127.0.0.1 --port ${String(PORT)} --strictPort`,
    url: `http://127.0.0.1:${String(PORT)}`,
    reuseExistingServer: process.env.CI === undefined,
  },
});
