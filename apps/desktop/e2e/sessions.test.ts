import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { withApp } from "./driver.ts";

// `run.sh` gives the app a home folder of its own, so this is not the
// user's Claude Code folder.
const PROJECT = join(homedir(), ".claude", "projects", "-home-me-app");

/** A two-line session in the shape Claude Code writes. */
const TRANSCRIPT = [
  { type: "ai-title", aiTitle: "Rename the settings page" },
  {
    type: "user",
    uuid: "p1",
    parentUuid: null,
    message: { role: "user", content: "Rename the settings page" },
  },
  {
    type: "assistant",
    uuid: "a1",
    parentUuid: "p1",
    message: {
      id: "r1",
      model: "claude-test",
      role: "assistant",
      content: [{ type: "text", text: "Renamed it to Preferences." }],
    },
  },
]
  .map((line) => JSON.stringify(line))
  .join("\n");

const ALERTS = `[...document.querySelectorAll("[role=alert]")].map((a) => a.textContent).join(" ")`;

void test("lists Claude Code's sessions and opens one without picking a file", async () => {
  mkdirSync(PROJECT, { recursive: true });
  writeFileSync(join(PROJECT, "session-1.jsonl"), TRANSCRIPT);

  await withApp(async ({ until, click }) => {
    await click("Map a session or Claude.ai export");
    // The list, or the error that took its place.
    const listed = await until(`
      const alerts = ${ALERTS};
      if (alerts !== "") return alerts;
      return [...document.querySelectorAll("button")]
        .some((b) => b.textContent.includes("-home-me-app/session-1.jsonl"));`);
    assert.equal(listed, true);
    await until(`const button = [...document.querySelectorAll("button")]
      .find((b) => b.textContent.includes("-home-me-app/session-1.jsonl"));
      button?.click();
      return button !== undefined;`);
    const opened = await until(`
      const alerts = ${ALERTS};
      if (alerts !== "") return alerts;
      return document.body.textContent.includes("Renamed it to Preferences.");`);
    assert.equal(opened, true);
    await click("Recent sessions");
    await until(
      `return document.body.textContent.includes("Recent Claude Code sessions")`,
    );
  });
});
