import { expect, test } from "@playwright/test";

test("opens the demo without a provider, and only once", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/#/app");

  const transcript = page.getByRole("list", { name: "Selected branch" });
  const map = page.getByRole("region", { name: "Conversation map" });
  const conversations = page.getByRole("navigation", { name: "Conversations" });
  const demoEntry = conversations.getByRole("button", {
    name: "Demo: which database for a small app?",
    exact: true,
  });

  await page.getByRole("button", { name: "Open the demo" }).click();
  await expect(transcript.getByText("How would I back it up?")).toBeVisible();
  // Answers are labelled as written by hand, not as a model's output.
  await expect(
    transcript.getByText("example (hand-written)").first(),
  ).toBeVisible();
  // The map shows every turn, with titles on the answers.
  await expect(map.locator(".map-node")).toHaveCount(9);
  await expect(
    map.locator(".map-node-assistant", { hasText: "Backing up SQLite" }),
  ).toBeVisible();

  // Choosing the other topic on the map shows it in the reading pane: the
  // question is the first of two at the fork, and its answer is the second
  // of two versions.
  await map
    .locator(".map-node-user", { hasText: "Go deeper on PostgreSQL" })
    .click();
  await expect(transcript.getByText("1 / 2")).toBeVisible();
  await expect(transcript.getByText("2 / 2")).toBeVisible();
  await expect(transcript.getByText("How would I back it up?")).toHaveCount(0);

  // Opening it again does not add a second copy, and it survives a reload.
  await page.getByRole("button", { name: "Open the demo" }).click();
  await expect(demoEntry).toHaveCount(1);
  await page.reload();
  await expect(demoEntry).toHaveCount(1);
  await demoEntry.click();
  await expect(map.locator(".map-node")).toHaveCount(9);

  expect(consoleErrors).toEqual([]);
});
