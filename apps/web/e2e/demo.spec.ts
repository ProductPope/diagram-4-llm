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
    name: "Demo: planning a feature launch",
    exact: true,
  });

  await page.getByRole("button", { name: "Open the demo" }).click();
  await expect(
    transcript.getByText("Now write the in-app announcement for everyone else"),
  ).toBeVisible();
  // Answers are labelled as written by hand, not as a model's output.
  await expect(
    transcript.getByText("example (hand-written)").first(),
  ).toBeVisible();
  // The map shows every turn, with titles on the answers.
  await expect(map.locator(".map-node")).toHaveCount(17);
  await expect(
    map.locator(".map-node-assistant", {
      hasText: "Announcement for everyone",
    }),
  ).toBeVisible();

  // Choosing another topic on the map shows it in the reading pane: the
  // question is the first of three at the fork, and its answer is the second
  // of two versions.
  await map.locator(".map-node-user", { hasText: "Start with scope" }).click();
  await expect(transcript.getByText("1 / 3")).toBeVisible();
  await expect(transcript.getByText("2 / 2")).toBeVisible();
  await expect(
    transcript.getByText("Now write the in-app announcement for everyone else"),
  ).toHaveCount(0);

  // Opening it again does not add a second copy, and it survives a reload.
  await page.getByRole("button", { name: "Open the demo" }).click();
  await expect(demoEntry).toHaveCount(1);
  await page.reload();
  await expect(demoEntry).toHaveCount(1);
  await demoEntry.click();
  await expect(map.locator(".map-node")).toHaveCount(17);

  expect(consoleErrors).toEqual([]);
});
