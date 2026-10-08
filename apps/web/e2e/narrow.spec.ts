import { expect, test, type Page } from "@playwright/test";

// WCAG 1.4.10: content reflows to 320 CSS pixels, the width of a 1280-pixel
// window at 400% zoom, without scrolling in two directions.
test.use({ viewport: { width: 320, height: 640 } });

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
}

test("every page fits 320 pixels wide", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Next question")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByLabel("Next question").click();
  await expect(
    page.getByRole("heading", { name: "What is this?" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto("/#/setup");
  await expect(
    page.getByRole("button", { name: "Skip for now" }),
  ).toBeInViewport();
  await expectNoHorizontalScroll(page);

  await page.goto("/#/app");
  await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("shows one view at a time on a narrow screen", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/#/app");

  const views = page.getByRole("group", { name: "View" });
  const conversations = page.getByRole("navigation", { name: "Conversations" });
  const transcript = page.getByRole("list", { name: "Selected branch" });
  const map = page.getByRole("region", { name: "Conversation map" });
  const input = page.getByLabel("Message", { exact: true });

  // The conversation is shown first; a draft survives switching away.
  await expect(
    views.getByRole("button", { name: "Conversation", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(conversations).toBeHidden();
  await input.fill("A draft");

  await views.getByRole("button", { name: "Conversations" }).click();
  await expect(conversations).toBeVisible();
  await expect(input).toBeHidden();

  // Opening something from the list shows it.
  await conversations.getByRole("button", { name: "Open the demo" }).click();
  await expect(
    transcript.getByText("Now write the in-app announcement for everyone else"),
  ).toBeVisible();
  await expect(input).toHaveValue("A draft");

  // Choosing a turn on the map shows it in the conversation.
  await views.getByRole("button", { name: "Map" }).click();
  await expect(transcript).toBeHidden();
  await map.locator(".map-node-user", { hasText: "Start with scope" }).click();
  await expect(map).toBeHidden();
  await expect(
    transcript.getByText("Start with scope", { exact: false }).first(),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(consoleErrors).toEqual([]);
});
