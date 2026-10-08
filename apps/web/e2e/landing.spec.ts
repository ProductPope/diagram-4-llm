import { expect, test } from "@playwright/test";

test("welcomes a new visitor with a conversation that builds up as they scroll", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/");

  const first = page.getByRole("region", { name: "What is this?" });
  await expect(
    first.getByText("a conversation is a map, not a scroll"),
  ).toBeVisible();

  // A later answer appears only when its exchange scrolls into view.
  const privacy = page.getByRole("region", { name: "Where does my data go?" });
  await expect(privacy).toHaveAttribute("data-phase", "waiting");
  await privacy.scrollIntoViewIfNeeded();
  await expect(privacy).toHaveAttribute("data-phase", "answered");
  await expect(
    privacy.getByText("Only to the model provider you choose"),
  ).toBeVisible();

  // The demo opens in the app, without any setup.
  await first.getByRole("button", { name: "Explore the demo" }).click();
  await expect(page).toHaveURL(/#\/app$/);
  await expect(
    page
      .getByRole("list", { name: "Selected branch" })
      .getByText("How would I back it up?"),
  ).toBeVisible();

  // Having used the app, the bare address opens it directly.
  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "Conversations" }),
  ).toBeVisible();

  // The name in the header leads back to the welcome page.
  await page.getByRole("link", { name: "diagram-4-llm" }).click();
  await expect(page).toHaveURL(/#\/welcome$/);
  await expect(first).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("setup can be skipped from any step", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Connect a model" }).click();
  await page.getByRole("radio", { name: /^Ollama/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/#\/app$/);
  await expect(
    page.getByText("Configure a provider in Settings before sending."),
  ).toBeVisible();
  // The composer leads back to setup.
  await page.getByRole("button", { name: "Connect a model" }).click();
  await expect(page).toHaveURL(/#\/setup$/);
});

test("shows every answer at once when the visitor prefers reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "How do I start?" }),
  ).toHaveAttribute("data-phase", "answered");
});
