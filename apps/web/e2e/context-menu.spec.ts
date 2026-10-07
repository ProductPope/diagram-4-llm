import { expect, test } from "@playwright/test";

import {
  answerEveryRequest,
  configureProvider,
  ENDPOINT,
  type SentMessage,
} from "./support";

test("branches from an earlier answer through the map's context menu", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const sent: SentMessage[][] = [];
  await page.route(ENDPOINT, (route) => answerEveryRequest(route, sent));
  await page.goto("/");
  await configureProvider(page);

  const input = page.getByLabel("Message", { exact: true });
  const transcript = page.getByRole("list", { name: "Selected branch" });
  const map = page.getByRole("region", { name: "Conversation map" });
  for (const question of ["Plan a trip to Japan", "Add a day in Kyoto"]) {
    await input.fill(question);
    await input.press("Control+Enter");
    await expect(transcript.getByText(`Answer to: ${question}`)).toBeVisible();
  }

  await map
    .locator(".map-node-assistant", { hasText: "Answer to: Plan a trip" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Branch from here" }).click();
  await expect(
    page.getByText("New branch from the selected answer."),
  ).toBeVisible();
  await expect(input).toBeFocused();

  await input.fill("Make it a cheaper trip");
  await input.press("Control+Enter");
  await expect(
    transcript.getByText("Answer to: Make it a cheaper trip"),
  ).toBeVisible();
  // The new branch saw the conversation up to that answer, not the other
  // branch, and the other branch is still there.
  expect(sent.at(-1)?.map((m) => m.content)).toEqual([
    "Plan a trip to Japan",
    "Answer to: Plan a trip to Japan",
    "Make it a cheaper trip",
  ]);
  await expect(map.locator(".map-node")).toHaveCount(6);
  await expect(
    map.locator(".map-node-user", { hasText: "Add a day in Kyoto" }),
  ).toBeVisible();

  // The menu also opens from the keyboard, on the focused node.
  await map
    .locator(".map-node-user", { hasText: "Add a day in Kyoto" })
    .focus();
  await page.keyboard.press("Shift+F10");
  await page
    .getByRole("menuitem", { name: "New version of this message" })
    .click();
  await expect(input).toHaveValue("Add a day in Kyoto");
  await expect(
    page.getByRole("button", { name: "Cancel editing" }),
  ).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
