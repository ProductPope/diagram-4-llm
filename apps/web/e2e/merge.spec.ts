import { expect, test } from "@playwright/test";

import {
  answerEveryRequest,
  configureProvider,
  ENDPOINT,
  type SentMessage,
} from "./support";

test("merges two branches into a new first message through their summaries", async ({
  page,
}) => {
  const sent: SentMessage[][] = [];
  await page.route(ENDPOINT, (route) =>
    answerEveryRequest(route, sent, (_, last) => {
      if (!last.startsWith("<turn")) return `Answer to: ${last}`;
      return last.includes("PostgreSQL")
        ? "PostgreSQL summary."
        : "SQLite summary.";
    }),
  );
  await page.goto("/#/app");
  await configureProvider(page);

  const input = page.getByLabel("Message", { exact: true });
  const transcript = page.getByRole("list", { name: "Selected branch" });
  const map = page.getByRole("region", { name: "Conversation map" });
  const attached = page.getByRole("region", {
    name: "Attached to your message",
  });
  const answerNode = (text: string) =>
    map.locator(".map-node-assistant", { hasText: `Answer to: ${text}` });

  await input.fill("Tell me about PostgreSQL");
  await input.press("Control+Enter");
  await expect(
    transcript.getByText("Answer to: Tell me about PostgreSQL"),
  ).toBeVisible();
  await page.getByRole("button", { name: "New first message" }).click();
  await expect(
    page.getByText("New first message. The model sees"),
  ).toBeVisible();
  await input.fill("Tell me about SQLite");
  await input.press("Control+Enter");
  await expect(
    transcript.getByText("Answer to: Tell me about SQLite"),
  ).toBeVisible();

  // The PostgreSQL branch has no summary yet, so one is written and then
  // attached; the SQLite branch's summary already exists and is reused.
  await answerNode("Tell me about SQLite").click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Summarise the branch up to here" })
    .click();
  await expect(
    transcript.getByRole("region", {
      name: "Summary of the branch up to here",
    }),
  ).toContainText("SQLite summary.");
  const requestsBefore = sent.length;

  await page.getByRole("button", { name: "New first message" }).click();
  await answerNode("Tell me about PostgreSQL").click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Attach a summary of this branch" })
    .click();
  await expect(attached).toContainText("Summary: PostgreSQL summary.");
  await answerNode("Tell me about SQLite").click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Attach a summary of this branch" })
    .click();
  await expect(attached).toContainText("Summary: SQLite summary.");
  // Only the PostgreSQL summary had to be written.
  expect(sent.length).toBe(requestsBefore + 1);

  await input.fill("Which one should I use?");
  await input.press("Control+Enter");
  await expect.poll(() => sent.length).toBe(requestsBefore + 2);
  // Only the two summaries and the question: scenario 4 of the plan.
  expect(sent.at(-1)?.map((m) => m.content)).toEqual([
    expect.stringMatching(
      /^<context source="summary" node="[^"]+">\nPostgreSQL summary\.\n<\/context>\n\n<context source="summary" node="[^"]+">\nSQLite summary\.\n<\/context>\n\nWhich one should I use\?$/,
    ),
  ]);
  await expect(map.locator(".map-node-user")).toHaveCount(3);
});
