import { expect, test } from "@playwright/test";

import {
  answerEveryRequest,
  configureProvider,
  ENDPOINT,
  type SentMessage,
} from "./support";

test("moves through the map with arrow keys and shows a branch with Enter", async ({
  page,
}) => {
  const sent: SentMessage[][] = [];
  await page.route(ENDPOINT, (route) => answerEveryRequest(route, sent));
  await page.goto("/#/app");
  await configureProvider(page);

  const input = page.getByLabel("Message", { exact: true });
  const transcript = page.getByRole("list", { name: "Selected branch" });
  const map = page.getByRole("region", { name: "Conversation map" });
  const ask = async (question: string) => {
    await input.fill(question);
    await input.press("Control+Enter");
    await expect(transcript.getByText(`Answer to: ${question}`)).toBeVisible();
  };

  await ask("Which database?");
  await ask("Tell me about PostgreSQL");
  await transcript
    .getByRole("listitem", { name: "Your message" })
    .nth(1)
    .getByRole("button", { name: "Edit" })
    .click();
  await input.fill("Tell me about SQLite");
  await input.press("Control+Enter");
  await expect(
    transcript.getByText("Answer to: Tell me about SQLite"),
  ).toBeVisible();

  // Only one node of the map is in the tab order: the end of the branch.
  const focusable = map.locator('.map-node[tabindex="0"]');
  await expect(focusable).toHaveCount(1);
  await expect(focusable).toHaveText(/Answer to: Tell me about SQLite/);

  const question = (text: string) =>
    map.locator(".map-node-user", { hasText: text });
  const answer = (text: string) =>
    map.locator(".map-node-assistant", { hasText: text });
  await focusable.focus();
  await page.keyboard.press("ArrowUp");
  await expect(question("Tell me about SQLite")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(question("Tell me about PostgreSQL")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(answer("Tell me about PostgreSQL")).toBeFocused();

  // Moving focus does not change the branch being read; Enter does.
  await expect(
    transcript.getByText("Answer to: Tell me about SQLite"),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(
    transcript.getByText("Answer to: Tell me about PostgreSQL"),
  ).toBeVisible();
  await expect(
    transcript.getByText("Answer to: Tell me about SQLite"),
  ).toHaveCount(0);

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(question("Which database?")).toBeFocused();
  // A root has no parent; the key does nothing.
  await page.keyboard.press("ArrowUp");
  await expect(question("Which database?")).toBeFocused();
});

test("focuses the composer with / and forks from the map with E", async ({
  page,
}) => {
  const sent: SentMessage[][] = [];
  await page.route(ENDPOINT, (route) => answerEveryRequest(route, sent));
  await page.goto("/#/app");
  await configureProvider(page);

  const input = page.getByLabel("Message", { exact: true });
  const transcript = page.getByRole("list", { name: "Selected branch" });
  const map = page.getByRole("region", { name: "Conversation map" });

  // "/" outside a text field focuses the composer and is not typed.
  await page.getByRole("button", { name: "Settings" }).focus();
  await page.keyboard.press("/");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  // Inside a text field it is an ordinary character.
  await page.keyboard.type("Which database? a/b");
  await expect(input).toHaveValue("Which database? a/b");
  await input.press("Control+Enter");
  await expect(
    transcript.getByText("Answer to: Which database? a/b"),
  ).toBeVisible();

  // E on the user's message in the map starts editing it in the composer.
  await map.locator('.map-node[tabindex="0"]').focus();
  await page.keyboard.press("ArrowUp");
  await expect(map.locator(".map-node-user")).toBeFocused();
  await page.keyboard.press("e");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("Which database? a/b");

  await input.fill("Which database for a small app?");
  await input.press("Control+Enter");
  await expect(
    transcript.getByText("Answer to: Which database for a small app?"),
  ).toBeVisible();
  // The edit is a new root next to the original; nothing was overwritten.
  await expect(map.locator(".map-node-user")).toHaveCount(2);
});
