import { expect, test } from "@playwright/test";

import {
  answerEveryRequest,
  configureProvider,
  ENDPOINT,
  type SentMessage,
} from "./support";

test("renames and deletes conversations, and a deleted one stays deleted", async ({
  page,
}) => {
  const sent: SentMessage[][] = [];
  await page.route(ENDPOINT, (route) => answerEveryRequest(route, sent));
  // A controllable clock, so the test can hold back the delayed save below.
  await page.clock.install();
  await page.goto("/");
  await configureProvider(page);

  const input = page.getByLabel("Message", { exact: true });
  const nav = page.getByRole("navigation", { name: "Conversations" });
  const saved = page
    .getByRole("status")
    .filter({ hasText: "All changes saved" });
  for (const question of ["First topic", "Second topic"]) {
    await page.getByRole("button", { name: "New conversation" }).click();
    await input.fill(question);
    await input.press("Control+Enter");
    await expect(
      nav.getByRole("button", { name: question, exact: true }),
    ).toBeVisible();
  }
  await expect(saved).toBeVisible();

  // Rename a conversation that is not open.
  await nav.getByRole("button", { name: "Actions for First topic" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const title = nav.getByLabel("Conversation title");
  await title.fill("Holiday plans");
  await title.press("Enter");
  await expect(
    nav.getByRole("button", { name: "Holiday plans", exact: true }),
  ).toBeVisible();

  // Escape cancels a rename.
  await nav.getByRole("button", { name: "Actions for Second topic" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await nav.getByLabel("Conversation title").fill("Discarded");
  await nav.getByLabel("Conversation title").press("Escape");
  await expect(
    nav.getByRole("button", { name: "Second topic", exact: true }),
  ).toBeVisible();

  // Rename the open conversation and delete it while the rename is still
  // waiting to be saved: the clock is paused, so the delayed save cannot
  // run first. Closing the conversation then saves it, and that save must
  // not bring it back after the delete.
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1000);
  await nav.getByRole("button", { name: "Actions for Second topic" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await nav.getByLabel("Conversation title").fill("To be deleted");
  await nav.getByLabel("Conversation title").press("Enter");
  // The rename applies at once; the list shows it after the save.
  await expect(
    page.getByRole("heading", { name: "To be deleted" }),
  ).toBeVisible();
  await nav.getByRole("button", { name: "Actions for Second topic" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirm = nav.getByRole("group", { name: "Delete Second topic" });
  // Focus starts on Cancel, so Enter alone does not delete.
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(
    nav.getByRole("button", { name: "To be deleted", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Selected branch" })).toHaveCount(
    0,
  );
  await page.clock.resume();

  await expect(saved).toBeVisible();
  await page.reload();
  await expect(
    nav.getByRole("button", { name: "Holiday plans", exact: true }),
  ).toBeVisible();
  await expect(
    nav.getByRole("button", { name: "To be deleted", exact: true }),
  ).toHaveCount(0);
  await expect(
    nav.getByRole("button", { name: "Second topic", exact: true }),
  ).toHaveCount(0);
});
