import { expect, test } from "@playwright/test";

test("opens with an empty field after a pause, and any key starts the conversation", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  const field = page.getByLabel("Next question");
  const first = page.getByRole("region", { name: "What is this?" });
  await expect(page.getByRole("link", { name: "diagram-4-llm" })).toBeVisible();
  await expect(field).toHaveCount(0);

  await page.clock.runFor(800);
  await expect(field).toBeVisible();
  await expect(field).toHaveValue("");
  await expect(first).toHaveCount(0);

  // The key is not typed: the first question is, one character at a time.
  await page.keyboard.press("x");
  const question = "What is this?";
  for (let length = 1; length <= question.length; length += 1) {
    await page.clock.runFor(45);
    await expect(field).toHaveValue(question.slice(0, length));
  }
  await expect(first).toHaveCount(0);

  // Once typed, it is sent, and the answer is typed before it shows.
  await page.clock.runFor(300);
  await expect(first).toHaveAttribute("data-phase", "typing");
  await page.clock.runFor(700);
  await expect(first).toHaveAttribute("data-phase", "answered");
  await expect(
    first.getByText("a conversation is a map, not a scroll"),
  ).toBeVisible();
  await expect(field).toHaveValue("Why not just keep chatting in one thread?");
});

test("a click or tap on the empty field starts the conversation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Next question").click();
  await expect(
    page
      .getByRole("region", { name: "What is this?" })
      .getByText("a conversation is a map, not a scroll"),
  ).toBeVisible();
});

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
  await page.getByLabel("Next question").press("Enter");
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
  await expect(page.getByLabel("Next question")).toHaveValue("");
  expect(consoleErrors).toEqual([]);
});

test("setup can be skipped from any step", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Next question").click();
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

test("starts and answers without pauses or typing when the visitor prefers reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.goto("/");
  const field = page.getByLabel("Next question");
  // The clock does not move, so nothing here waits for a timer.
  await expect(field).toBeVisible();
  await expect(field).toHaveValue("");
  await page.keyboard.press("x");
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
