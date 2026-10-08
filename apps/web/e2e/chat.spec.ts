import { expect, test } from "@playwright/test";

import {
  answerEveryRequest,
  configureProvider,
  ENDPOINT,
  type SentMessage,
} from "./support";

test("branches a conversation, sends only the branch's context, and keeps it after reload", async ({
  page,
}) => {
  const sent: SentMessage[][] = [];
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.route(ENDPOINT, (route) => answerEveryRequest(route, sent));
  await page.goto("/#/app");

  await configureProvider(page);

  const input = page.getByLabel("Message", { exact: true });
  const transcript = page.getByRole("list", { name: "Selected branch" });
  const userMessages = transcript.getByRole("listitem", {
    name: "Your message",
  });
  const map = page.getByRole("region", { name: "Conversation map" });

  await input.fill("Which database?");
  await input.press("Control+Enter");
  await expect(
    transcript.getByText("Answer to: Which database?"),
  ).toBeVisible();

  await input.fill("Tell me about PostgreSQL");
  await page.getByText(/^Context: 3 messages/).click();
  await expect(page.locator(".inspector pre").last()).toHaveText(
    "Tell me about PostgreSQL",
  );
  await input.press("Control+Enter");
  await expect(
    transcript.getByText("Answer to: Tell me about PostgreSQL"),
  ).toBeVisible();

  // Editing the second message forks the conversation at the first answer.
  await userMessages.nth(1).getByRole("button", { name: "Edit" }).click();
  await input.fill("Tell me about SQLite");
  await input.press("Control+Enter");
  await expect(
    transcript.getByText("Answer to: Tell me about SQLite"),
  ).toBeVisible();
  await expect(
    transcript.getByText("Answer to: Tell me about PostgreSQL"),
  ).toHaveCount(0);

  // The SQLite branch never saw the PostgreSQL branch.
  expect(sent.at(-1)?.map((m) => m.content)).toEqual([
    "Which database?",
    "Answer to: Which database?",
    "Tell me about SQLite",
  ]);

  await userMessages
    .nth(1)
    .getByRole("button", { name: "Previous version" })
    .click();
  await expect(
    transcript.getByText("Answer to: Tell me about PostgreSQL"),
  ).toBeVisible();

  // The map shows both branches; choosing a node there shows its branch.
  await expect(map.locator(".map-node")).toHaveCount(6);
  await map
    .locator(".map-node", { hasText: "Answer to: Tell me about SQLite" })
    .click();
  await expect(
    transcript.getByText("Answer to: Tell me about SQLite"),
  ).toBeVisible();
  await expect(
    transcript.getByText("Answer to: Tell me about PostgreSQL"),
  ).toHaveCount(0);

  const savedConversation = page
    .getByRole("navigation", { name: "Conversations" })
    .getByRole("button", { name: "Which database?", exact: true });
  await expect(savedConversation).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "All changes saved" }),
  ).toBeVisible();
  await page.reload();
  await savedConversation.click();
  await expect(
    transcript.getByText("Answer to: Which database?"),
  ).toBeVisible();
  await expect(
    transcript.getByText("Answer to: Tell me about SQLite"),
  ).toBeVisible();

  // Covers the Content Security Policy too: a blocked style or script logs an error.
  expect(consoleErrors).toEqual([]);
});

test("asks for a provider before sending", async ({ page }) => {
  await page.goto("/#/app");
  await expect(
    page.getByText("Configure a provider in Settings before sending."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
});
