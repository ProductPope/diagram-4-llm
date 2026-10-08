import { expect, test } from "@playwright/test";

import {
  answerEveryRequest,
  configureProvider,
  ENDPOINT,
  type SentMessage,
} from "./support";

test("attaches an answer from another branch to a new message", async ({
  page,
}) => {
  const sent: SentMessage[][] = [];
  await page.route(ENDPOINT, (route) => answerEveryRequest(route, sent));
  await page.goto("/#/app");
  await configureProvider(page);

  const input = page.getByLabel("Message", { exact: true });
  const transcript = page.getByRole("list", { name: "Selected branch" });
  const map = page.getByRole("region", { name: "Conversation map" });
  await input.fill("Which database?");
  await input.press("Control+Enter");
  await expect(
    transcript.getByText("Answer to: Which database?"),
  ).toBeVisible();
  await input.fill("Tell me about PostgreSQL");
  await input.press("Control+Enter");
  await expect(
    transcript.getByText("Answer to: Tell me about PostgreSQL"),
  ).toBeVisible();

  // A second branch from the first answer.
  await map
    .locator(".map-node-assistant", { hasText: "Answer to: Which database?" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Branch from here" }).click();
  await input.fill("Tell me about SQLite");
  await input.press("Control+Enter");
  await expect(
    transcript.getByText("Answer to: Tell me about SQLite"),
  ).toBeVisible();

  // The PostgreSQL answer, from the other branch, is attached with the
  // keyboard.
  const postgres = map.locator(".map-node-assistant", {
    hasText: "Answer to: Tell me about PostgreSQL",
  });
  await postgres.focus();
  await expect(postgres).toBeFocused();
  await page.keyboard.press("a");
  await expect(postgres).toContainText("attached");
  const attached = page.getByRole("region", {
    name: "Attached to your message",
  });
  await expect(attached).toContainText("Answer to: Tell me about PostgreSQL");

  // Turns on the branch being continued are in the context already.
  await map
    .locator(".map-node-assistant", { hasText: "Answer to: Which database?" })
    .click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Attach to your message" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");

  await input.fill("Compare the two");
  await expect(page.getByText(/Context: 5 messages/)).toBeVisible();
  await input.press("Control+Enter");
  await expect.poll(() => sent.length).toBe(4);

  // The SQLite branch plus that one answer, in a marked block; the
  // PostgreSQL question is not included.
  const last = sent.at(-1)?.map((m) => m.content) ?? [];
  expect(last.slice(0, 4)).toEqual([
    "Which database?",
    "Answer to: Which database?",
    "Tell me about SQLite",
    "Answer to: Tell me about SQLite",
  ]);
  expect(last).toHaveLength(5);
  expect(last[4]).toMatch(
    /^<context source="assistant" node="[^"]+">\nAnswer to: Tell me about PostgreSQL\n<\/context>\n\nCompare the two$/,
  );
  await expect(attached).toHaveCount(0);

  // The message shows what was attached, and the attachment leads to its
  // own branch.
  const message = transcript.getByRole("listitem", { name: "Your message" });
  await message
    .filter({ hasText: "Compare the two" })
    .getByRole("button", { name: "Answer to: Tell me about PostgreSQL" })
    .click();
  await expect(
    transcript.getByText("Tell me about PostgreSQL", { exact: true }),
  ).toBeVisible();
  await expect(transcript.getByText("Compare the two")).toHaveCount(0);
});

test("blocks sending while an attached turn is in the branch", async ({
  page,
}) => {
  const sent: SentMessage[][] = [];
  await page.route(ENDPOINT, (route) => answerEveryRequest(route, sent));
  await page.goto("/#/app");
  await configureProvider(page);

  const input = page.getByLabel("Message", { exact: true });
  const transcript = page.getByRole("list", { name: "Selected branch" });
  const map = page.getByRole("region", { name: "Conversation map" });
  await input.fill("First question");
  await input.press("Control+Enter");
  await expect(transcript.getByText("Answer to: First question")).toBeVisible();
  await map
    .locator(".map-node-user", { hasText: "First question" })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "New version of this message" })
    .click();
  await input.fill("Second question");
  await input.press("Control+Enter");
  await expect(
    transcript.getByText("Answer to: Second question"),
  ).toBeVisible();

  // Attached while the second branch is shown, then the first is chosen.
  await map
    .locator(".map-node-assistant", { hasText: "Answer to: First question" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Attach to your message" }).click();
  await map
    .locator(".map-node-assistant", { hasText: "Answer to: First question" })
    .click();
  await input.fill("Continue");
  await expect(page.getByText("(already in this branch)")).toBeVisible();
  await expect(
    page.getByText("An attached turn is already in this branch."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();

  await page
    .getByRole("button", { name: "Remove “Answer to: First question”" })
    .click();
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
});
