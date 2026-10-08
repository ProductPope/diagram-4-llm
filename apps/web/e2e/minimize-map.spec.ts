import { expect, test } from "@playwright/test";

import { answerEveryRequest, configureProvider, ENDPOINT } from "./support";

test("minimizes the map to a strip that navigates the branch", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.route(ENDPOINT, (route) => answerEveryRequest(route, []));
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("/#/app");
  await configureProvider(page);
  await page.getByRole("button", { name: "Open the demo" }).click();

  const transcript = page.getByRole("list", { name: "Selected branch" });
  // Answers contain lists of their own, so only the transcript's own items.
  const turns = transcript.locator(":scope > li");
  const map = page.getByRole("region", { name: "Conversation map" });
  const strip = page.getByRole("navigation", { name: "Branch outline" });
  const markers = strip.getByRole("listitem").getByRole("button");
  await expect(turns.last()).toBeVisible();
  const turnCount = await turns.count();

  await page.getByRole("button", { name: "Minimize the map" }).click();
  await expect(map).toHaveCount(0);
  // Focus moves to the button that replaces the one pressed.
  await expect(
    strip.getByRole("button", { name: "Show the map" }),
  ).toBeFocused();
  // One marker per turn of the branch, named like the turn.
  await expect(markers).toHaveCount(turnCount);
  await expect(markers.first()).toHaveAccessibleName(
    /^Your message: I'm building a small web app/,
  );

  // The strip follows the reading: the turns on screen are marked.
  await turns.first().scrollIntoViewIfNeeded();
  await expect(markers.first()).toHaveAttribute("aria-current", "location");
  await turns.last().scrollIntoViewIfNeeded();
  await expect(turns.first()).not.toBeInViewport();
  await expect(markers.first()).not.toHaveAttribute("aria-current");

  // Choosing a marker scrolls the conversation to its turn.
  await markers.first().click();
  await expect(turns.first()).toBeInViewport();

  // The strip grows with the branch.
  const input = page.getByLabel("Message", { exact: true });
  await input.fill("And restoring it?");
  await input.press("Control+Enter");
  await expect(
    transcript.getByText("Answer to: And restoring it?"),
  ).toBeVisible();
  await expect(markers).toHaveCount(turnCount + 2);
  await expect(markers.last()).toHaveAccessibleName(
    "Answer: Answer to: And restoring it?",
  );

  // The choice is remembered.
  await expect(page.getByText("All changes saved")).toBeVisible();
  await page.reload();
  await page
    .getByRole("navigation", { name: "Conversations" })
    .getByRole("button", {
      name: "Demo: which database for a small app?",
      exact: true,
    })
    .click();
  await expect(markers).toHaveCount(turnCount + 2);
  await expect(map).toHaveCount(0);

  await strip.getByRole("button", { name: "Show the map" }).click();
  await expect(map).toBeVisible();
  await expect(strip).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Minimize the map" }),
  ).toBeFocused();

  expect(consoleErrors).toEqual([]);
});
