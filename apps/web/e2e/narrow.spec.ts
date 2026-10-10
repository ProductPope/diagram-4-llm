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

  await page.goto("/#/features");
  await expect(page.getByRole("heading", { name: "Features" })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto("/#/session");
  const picker = page.getByLabel("Open a transcript or export");
  await expect(
    page.getByRole("heading", {
      name: "Map of a Claude Code session or Claude.ai conversation",
    }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await picker.setInputFiles({
    name: "session.jsonl",
    mimeType: "application/jsonl",
    buffer: Buffer.from(
      JSON.stringify({
        type: "user",
        uuid: "p1",
        parentUuid: null,
        message: { role: "user", content: "A prompt" },
      }),
    ),
  });
  await expect(page.getByRole("region", { name: "Session map" })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // An export adds a conversation list, whose titles can be long.
  await page.getByLabel("Open another file").setInputFiles({
    name: "conversations.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify([
        {
          uuid: "c1",
          name: "A conversation title long enough to be wider than the screen",
          updated_at: "2026-10-08T00:00:00Z",
          chat_messages: [
            {
              uuid: "h1",
              parent_message_uuid: null,
              sender: "human",
              content: [{ type: "text", text: "A prompt" }],
            },
          ],
        },
      ]),
    ),
  });
  await expect(page.getByLabel("Conversation")).toBeVisible();
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

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // A header that wraps to a second row pushes the page down the small
  // screen, so the name and every control in the header share one row.
  test("each page header fits on one row", async ({ page }) => {
    for (const path of [
      "/",
      "/#/setup",
      "/#/app",
      "/#/features",
      "/#/session",
    ]) {
      await page.goto(path);
      const header = page.getByRole("banner");
      const brand = header.getByRole("link", { name: "diagram-4-llm" });
      const last = header
        .getByRole("button")
        .or(header.getByRole("link"))
        .last();
      await expect(last).toBeVisible();
      const brandBox = await brand.boundingBox();
      const lastBox = await last.boundingBox();
      expect(brandBox, path).not.toBeNull();
      expect(lastBox, path).not.toBeNull();
      const middle = (box: { y: number; height: number } | null) =>
        (box?.y ?? 0) + (box?.height ?? 0) / 2;
      expect(Math.abs(middle(brandBox) - middle(lastBox)), path).toBeLessThan(
        2,
      );
    }
  });
});
