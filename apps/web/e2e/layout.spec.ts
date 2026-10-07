import { expect, test } from "@playwright/test";

test("puts the map on the right and keeps panel widths the user sets", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open the demo" }).click();

  const map = page.getByRole("region", { name: "Conversation map" });
  const transcript = page.getByRole("list", { name: "Selected branch" });
  await expect(map.locator(".map-node").first()).toBeVisible();
  const mapBox = await map.boundingBox();
  const transcriptBox = await transcript.boundingBox();
  expect(mapBox).not.toBeNull();
  expect(transcriptBox).not.toBeNull();
  if (mapBox === null || transcriptBox === null) return;
  expect(mapBox.x).toBeGreaterThan(transcriptBox.x);

  // The separators are keyboard operable.
  const separator = page.getByRole("separator", { name: "Resize the map" });
  await separator.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
  await expect
    .poll(async () => (await map.boundingBox())?.width ?? 0)
    .toBeGreaterThan(mapBox.width + 40);
  const widened = (await map.boundingBox())?.width ?? 0;

  await page.reload();
  await expect
    .poll(async () => (await map.boundingBox())?.width ?? 0)
    .toBeCloseTo(widened, -1);

  // Dragging with the mouse sets a resize cursor on the whole page through a
  // constructed stylesheet; it must not violate the CSP.
  const handle = await page
    .getByRole("separator", { name: "Resize the sidebar" })
    .boundingBox();
  expect(handle).not.toBeNull();
  if (handle === null) return;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 200);
  await page.mouse.down();
  await page.mouse.move(handle.x + 60, handle.y + 200, { steps: 5 });
  await page.mouse.up();
  expect(consoleErrors).toEqual([]);
});
