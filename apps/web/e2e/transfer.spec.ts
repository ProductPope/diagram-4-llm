import { readFile, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import {
  answerEveryRequest,
  configureProvider,
  ENDPOINT,
  type SentMessage,
} from "./support";

test("exports a conversation and imports it into a browser that has never seen it", async ({
  page,
  browser,
}, testInfo) => {
  const sent: SentMessage[][] = [];
  await page.route(ENDPOINT, (route) => answerEveryRequest(route, sent));
  await page.goto("/");
  await configureProvider(page);
  const input = page.getByLabel("Message", { exact: true });
  await input.fill("Which database?");
  await input.press("Control+Enter");
  await expect(
    page
      .getByRole("list", { name: "Selected branch" })
      .getByText("Answer to: Which database?"),
  ).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export conversation" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(
    "which-database.diagram-4-llm.json",
  );
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);

  // A new browser context has its own, empty IndexedDB.
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await other.goto("/");
  await expect(other.getByText("No conversations yet.")).toBeVisible();
  const importInput = other.getByLabel("Import conversation");

  await importInput.setInputFiles(file);
  const transcript = other.getByRole("list", { name: "Selected branch" });
  await expect(
    transcript.getByText("Answer to: Which database?"),
  ).toBeVisible();
  await expect(
    other
      .getByRole("navigation", { name: "Conversations" })
      .getByRole("button", { name: "Which database?", exact: true }),
  ).toBeVisible();

  // Importing the same conversation again changes nothing.
  await importInput.setInputFiles(file);
  await expect(other.getByRole("alert")).toContainText("already in the app");

  // A damaged file is rejected with the reason.
  const document = JSON.parse(await readFile(file, "utf8")) as {
    nodes: unknown[];
  };
  document.nodes.reverse();
  const damaged = testInfo.outputPath("damaged.json");
  await writeFile(damaged, JSON.stringify(document));
  await importInput.setInputFiles(damaged);
  await expect(other.getByRole("alert")).toContainText(
    "damaged.json was not imported",
  );

  await fresh.close();
});
