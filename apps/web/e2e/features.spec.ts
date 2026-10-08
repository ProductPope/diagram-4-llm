import { expect, test, type Page } from "@playwright/test";

const FEATURES = [
  "Branches on a map",
  "Attachments from other branches",
  "Summaries",
  "Merging branches",
  "Token budget",
  "Suggested branches",
  "Map of a Claude Code session",
  "Local MCP server and session pane",
];

/** The animation running on the first animated part of an illustration. */
function animationOfFirstStep(page: Page): Promise<string> {
  return page
    .locator(".feature-step")
    .first()
    .evaluate((element) => getComputedStyle(element).animationName);
}

test("explains each feature next to the settings", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/#/app");

  await page.getByRole("button", { name: "Features" }).click();
  await expect(page.getByRole("heading", { name: "Features" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toHaveText(FEATURES);

  // The illustrations loop, so they can be stopped; stopped, they show
  // every step at once.
  expect(await animationOfFirstStep(page)).toBe("feature-step-1");
  await page.getByRole("button", { name: "Pause animations" }).click();
  expect(await animationOfFirstStep(page)).toBe("none");
  await expect(page.locator(".feature-step").first()).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Play animations" }).click();
  expect(await animationOfFirstStep(page)).toBe("feature-step-1");

  await page.getByRole("button", { name: "Back to conversations" }).click();
  await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("shows still pictures when reduced motion is requested", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/features");

  await expect(page.getByRole("heading", { name: "Features" })).toBeVisible();
  expect(await animationOfFirstStep(page)).toBe("none");
  await expect(
    page.getByRole("button", { name: "Pause animations" }),
  ).toBeHidden();
});
