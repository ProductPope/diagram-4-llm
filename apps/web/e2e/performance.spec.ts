import { writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { largeConversation } from "./large-conversation";

const TURNS = 1_000;
// About three times the times measured on a development machine (about
// 0.8 s and 0.35 s in headless Chromium), so the test catches regressions
// rather than differences between machines.
const IMPORT_BUDGET_MS = 3_000;
const SWITCH_BUDGET_MS = 1_000;

test(`stays responsive with a ${String(TURNS)}-turn conversation`, async ({
  page,
}, testInfo) => {
  const file = testInfo.outputPath("large.json");
  await writeFile(file, JSON.stringify(largeConversation(TURNS)));
  await page.goto("/#/app");

  const map = page.getByRole("region", { name: "Conversation map" });
  const transcript = page.getByRole("list", { name: "Selected branch" });

  const importStart = Date.now();
  await page.getByLabel("Import conversation").setInputFiles(file);
  await expect(
    transcript.getByText("Question 0", { exact: true }),
  ).toBeVisible();
  await expect(map.locator(".map-node").first()).toBeVisible();
  const importMs = Date.now() - importStart;

  // Switching to another version of a turn on the selected branch.
  const tip = transcript.getByRole("listitem").last();
  const before = await tip.textContent();
  const switchStart = Date.now();
  await transcript
    .getByRole("button", { name: "Previous version" })
    .first()
    .click();
  await expect(tip).not.toHaveText(before ?? "");
  const switchMs = Date.now() - switchStart;

  // The map keeps the end of the selected branch in view.
  await expect(map.locator(".map-node-branch").last()).toBeInViewport();

  testInfo.annotations.push({
    type: "import-and-render-ms",
    description: String(importMs),
  });
  testInfo.annotations.push({
    type: "switch-branch-ms",
    description: String(switchMs),
  });
  console.log(
    `${String(TURNS)} turns: import and first render ${String(importMs)} ms, branch switch ${String(switchMs)} ms`,
  );
  expect(importMs).toBeLessThan(IMPORT_BUDGET_MS);
  expect(switchMs).toBeLessThan(SWITCH_BUDGET_MS);
});
