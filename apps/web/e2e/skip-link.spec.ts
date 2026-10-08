import { expect, test } from "@playwright/test";

// WCAG 2.4.1: a keyboard user can bypass the header and the list of
// conversations, which come before the conversation in the tab order.

test("skips to the conversation from the first Tab", async ({ page }) => {
  await page.goto("/#/app");
  const skip = page.getByRole("link", { name: "Skip to the conversation" });

  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
  // Hidden until focused, then shown where a sighted user can see it.
  expect((await skip.boundingBox())?.width).toBeGreaterThan(1);
  await expect(skip).toBeInViewport();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  // The app routes on the URL fragment; the link must not leave the page.
  expect(new URL(page.url()).hash).toBe("#/app");

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Message", { exact: true })).toBeFocused();
  // Hidden again once focus has moved on.
  expect((await skip.boundingBox())?.width).toBeLessThanOrEqual(1);
});

test("shows the conversation when skipping from another view on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/#/app");
  const views = page.getByRole("group", { name: "View" });
  await views.getByRole("button", { name: "Map" }).click();
  await expect(page.getByRole("main")).toBeHidden();

  await page.getByRole("link", { name: "Skip to the conversation" }).focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("main")).toBeFocused();
  await expect(
    views.getByRole("button", { name: "Conversation", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
