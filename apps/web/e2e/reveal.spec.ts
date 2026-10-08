import { expect, test } from "@playwright/test";

test("scrolls the conversation to a turn chosen on the map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("/#/app");
  await page.getByRole("button", { name: "Open the demo" }).click();

  const transcript = page.getByRole("list", { name: "Selected branch" });
  const map = page.getByRole("region", { name: "Conversation map" });
  const first = transcript.getByRole("listitem").first();
  const last = transcript.getByRole("listitem").last();

  // Scroll to the end of the conversation, so the first turn is out of view.
  await last.scrollIntoViewIfNeeded();
  await expect(first).not.toBeInViewport();

  await map
    .locator(".map-node-user", { hasText: "I'm the product manager" })
    .click();
  await expect(first).toBeInViewport();

  // Choosing a turn further down brings it into view as well.
  await map
    .locator(".map-node-assistant", { hasText: "Announcement for everyone" })
    .click();
  await expect(last).toBeInViewport();
});
