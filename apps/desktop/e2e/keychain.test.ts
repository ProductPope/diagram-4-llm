import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import { withApp } from "./driver.ts";

const SETTINGS = `localStorage.getItem("diagram-4-llm.provider-settings")`;
const ALERTS = `[...document.querySelectorAll("[role=alert]")].map((a) => a.textContent)`;

void test("keeps the API key in the keychain, not in the page's storage", async () => {
  await withApp(async ({ run, until, type, click }) => {
    await click("Settings");
    await until(`return document.querySelector("#settings-api-key") !== null`);
    await type("#settings-api-key", "sk-desktop-test");
    await type("#settings-models", "test-model");
    await click("Save");
    const saved = String(await until(`return ${SETTINGS}`));
    assert.match(saved, /test-model/);
    assert.doesNotMatch(saved, /sk-desktop-test/);
    assert.deepEqual(await run(`return ${ALERTS}`), []);
  });

  const secret = execFileSync("secret-tool", [
    "lookup",
    "service",
    "io.github.productpope.diagram-4-llm",
    "username",
    "provider-api-key",
  ]).toString();
  assert.equal(secret, "sk-desktop-test");

  // A new start reads the key back from the keychain.
  await withApp(async ({ until, click }) => {
    await click("Settings");
    assert.equal(
      await until(`return document.querySelector("#settings-api-key")?.value`),
      "sk-desktop-test",
    );
  });
});
