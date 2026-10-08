import { expect, test } from "@playwright/test";

test("welcomes a new visitor with a conversation they move forward", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/");

  const exchange = (question: string) =>
    page.getByRole("region", { name: question });
  const first = exchange("What is this?");
  await expect(
    first.getByText("a conversation is a map, not a scroll"),
  ).toBeVisible();
  // Nothing else is asked until the visitor asks.
  await expect(
    exchange("Why not just keep chatting in one thread?"),
  ).toHaveCount(0);

  // Enter sends the suggested question; the answer is typed, then shown.
  await expect(page.getByLabel("Next question")).toHaveValue(
    "Why not just keep chatting in one thread?",
  );
  await page.keyboard.press("Enter");
  const second = exchange("Why not just keep chatting in one thread?");
  await expect(second).toHaveAttribute("data-phase", "typing");
  await expect(second).toHaveAttribute("data-phase", "answered");
  await expect(second.getByText("Long conversations drift.")).toBeVisible();

  // Send asks the next suggestion; another question can be picked instead.
  await page.getByRole("button", { name: "Where does my data go?" }).click();
  const privacy = exchange("Where does my data go?");
  await expect(
    privacy.getByText("Only to the model provider you choose"),
  ).toBeVisible();
  await expect(page.getByLabel("Next question")).toHaveValue(
    "What can I do with it today?",
  );
  await page.getByRole("button", { name: "Send" }).click();
  await expect(
    exchange("What can I do with it today?").getByText(
      "Branch from any message",
    ),
  ).toBeVisible();

  // Show everything reveals the rest, and the composer goes away.
  await page.getByRole("button", { name: "Show everything" }).click();
  await expect(exchange("How do I start?")).toBeVisible();
  await expect(page.getByLabel("Next question")).toHaveCount(0);

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

test("answers without a typing pause when the visitor prefers reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const first = page.getByRole("region", { name: "What is this?" });
  await expect(first).toBeVisible();
  expect(await first.getAttribute("data-phase")).toBe("answered");
  await page.getByRole("button", { name: "Send" }).click();
  const second = page.getByRole("region", {
    name: "Why not just keep chatting in one thread?",
  });
  await expect(second).toBeVisible();
  expect(await second.getAttribute("data-phase")).toBe("answered");
});
