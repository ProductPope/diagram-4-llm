import { expect, test, type Page } from "@playwright/test";

/**
 * Moves the installed clock on one interval at a time until `reached`
 * holds. The welcome page schedules each timer only after rendering what
 * the previous one changed, so one long jump would fire a single timer,
 * and a jump made before the page has scheduled the next timer fires none.
 */
async function stepUntil(
  page: Page,
  intervalMs: number,
  reached: () => Promise<boolean>,
) {
  for (let step = 0; step < 100; step += 1) {
    if (await reached()) return;
    await page.clock.runFor(intervalMs);
  }
  throw new Error("The page did not reach the expected state.");
}

test("opens with an empty field after a pause, and any key starts the conversation", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  const field = page.getByLabel("Next question");
  const first = page.getByRole("region", { name: "What is this?" });
  const phaseOfFirst = async () =>
    (await first.count()) === 0 ? null : first.getAttribute("data-phase");
  await expect(page.getByRole("link", { name: "diagram-4-llm" })).toBeVisible();
  await expect(field).toHaveCount(0);

  await stepUntil(page, 100, async () => (await field.count()) > 0);
  await expect(field).toHaveValue("");
  await expect(first).toHaveCount(0);

  // The key is not typed: the first question is, a little at a time.
  await page.keyboard.press("x");
  const question = "What is this?";
  await stepUntil(page, 45, async () => (await field.inputValue()) !== "");
  const typed = await field.inputValue();
  expect(question.startsWith(typed) && typed.length < question.length).toBe(
    true,
  );
  await expect(first).toHaveCount(0);
  await stepUntil(
    page,
    45,
    async () => (await field.inputValue()) === question,
  );
  await expect(first).toHaveCount(0);

  // Once typed, it is sent. The answer is "typed", then written out a little
  // at a time, as a model streams it.
  await stepUntil(page, 100, async () => (await phaseOfFirst()) === "typing");
  await stepUntil(page, 100, async () => (await phaseOfFirst()) === "writing");
  const answer = first.getByRole("paragraph").first();
  await stepUntil(page, 32, async () => (await answer.count()) > 0);
  const sentence =
    "A chat client for AI models in which a conversation is a map, not a scroll.";
  const written = (await answer.textContent()) ?? "";
  expect(sentence.startsWith(written) && written.length < sentence.length).toBe(
    true,
  );
  await expect(first.getByRole("button")).toHaveCount(0);

  await page.clock.resume();
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

test("the field moves from the middle to the bottom once the first question is sent", async ({
  page,
}) => {
  await page.goto("/");
  const field = page.getByLabel("Next question");
  await expect(field).toBeVisible();
  const middle = await field.boundingBox();
  // Record the field's transitions from here on.
  await page.evaluate(() => {
    const form = document.getElementById("landing-question")?.closest("form");
    const moves: string[] = [];
    Object.assign(window, { moves });
    form?.addEventListener("transitionstart", (event) => {
      moves.push(event.propertyName);
    });
  });

  await field.click();
  await expect(
    page.getByRole("region", { name: "What is this?" }),
  ).toHaveAttribute("data-phase", "answered");
  const bottom = await field.boundingBox();
  expect(bottom?.y ?? 0).toBeGreaterThan(middle?.y ?? Infinity);
  expect(
    await page.evaluate(() => (window as unknown as { moves: string[] }).moves),
  ).toContain("transform");
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

  // Enter sends the suggested question once the answer is written out; the
  // next answer is typed, then shown.
  await expect(first).toHaveAttribute("data-phase", "answered");
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
      .getByText("Now write the in-app announcement for everyone else"),
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

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 664 }, hasTouch: true });

  test("keeps the question and the answer being written in view", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByLabel("Next question").tap();
    await expect(
      page.getByRole("region", { name: "What is this?" }),
    ).toHaveAttribute("data-phase", "answered");
    await page.getByRole("button", { name: "Send" }).tap();

    const exchange = page.getByRole("region", {
      name: "Why not just keep chatting in one thread?",
    });
    const header = page.getByRole("banner");
    const dock = page.getByRole("region", { name: "Ask a question" });
    // The question scrolls up under the header, as a sent message does.
    await expect(async () => {
      const top = (await exchange.boundingBox())?.y ?? Infinity;
      const headerBox = await header.boundingBox();
      const below = (headerBox?.y ?? 0) + (headerBox?.height ?? 0);
      expect(top).toBeGreaterThanOrEqual(below);
      expect(top).toBeLessThan(below + 40);
    }).toPass();

    // While the answer is written out, its newest text stays above the
    // questions and the field at the bottom of the screen.
    await expect(exchange).toHaveAttribute("data-phase", "writing");
    const answer = exchange
      .getByText("Long conversations drift.")
      .locator("..");
    while ((await exchange.getAttribute("data-phase")) === "writing") {
      const written = await answer.boundingBox();
      const dockTop = (await dock.boundingBox())?.y ?? 0;
      expect((written?.y ?? 0) + (written?.height ?? 0)).toBeLessThanOrEqual(
        dockTop + 1,
      );
    }
    await expect(exchange.getByText("the map shows where")).toBeInViewport();
  });
});

test.describe("on a phone, the suggestions", () => {
  test.use({ viewport: { width: 390, height: 664 }, hasTouch: true });

  test("stay on one row that scrolls sideways", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Next question").tap();
    await expect(
      page.getByRole("region", { name: "What is this?" }),
    ).toHaveAttribute("data-phase", "answered");

    const dock = page.getByRole("region", { name: "Ask a question" });
    const row = dock
      .getByRole("button", { name: "Show everything" })
      .locator("..");
    const suggestions = row.getByRole("button");
    const tops = await suggestions.evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().top),
    );
    expect(tops.length).toBeGreaterThan(2);
    expect(new Set(tops).size).toBe(1);

    // The row is wider than the screen, the page itself is not.
    const { rowWidth, rowScrollWidth, pageScrollWidth } = await row.evaluate(
      (element) => ({
        rowWidth: element.clientWidth,
        rowScrollWidth: element.scrollWidth,
        pageScrollWidth: document.documentElement.scrollWidth,
      }),
    );
    expect(rowScrollWidth).toBeGreaterThan(rowWidth);
    expect(pageScrollWidth).toBeLessThanOrEqual(390);

    const last = dock.getByRole("button", { name: "Show everything" });
    await expect(last).not.toBeInViewport();
    await row.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await expect(last).toBeInViewport();
    await last.tap();
    await expect(
      page.getByRole("region", { name: "How do I start?" }),
    ).toBeVisible();
  });
});
