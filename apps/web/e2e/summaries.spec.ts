import { expect, test } from "@playwright/test";

import {
  answerEveryRequest,
  configureProvider,
  ENDPOINT,
  type SentMessage,
} from "./support";

test("summarises a branch, edits the summary and attaches it to another branch", async ({
  page,
}) => {
  const sent: SentMessage[][] = [];
  await page.route(ENDPOINT, (route) =>
    answerEveryRequest(route, sent, (_, last) =>
      last.startsWith("<turn")
        ? "PostgreSQL suits **many writers**."
        : `Answer to: ${last}`,
    ),
  );
  await page.goto("/#/app");
  await configureProvider(page);

  const input = page.getByLabel("Message", { exact: true });
  const transcript = page.getByRole("list", { name: "Selected branch" });
  const map = page.getByRole("region", { name: "Conversation map" });
  for (const question of ["Which database?", "Tell me about PostgreSQL"]) {
    await input.fill(question);
    await input.press("Control+Enter");
    await expect(transcript.getByText(`Answer to: ${question}`)).toBeVisible();
  }

  await transcript
    .getByRole("listitem", { name: "Answer" })
    .last()
    .getByRole("button", { name: "Summarise" })
    .click();
  const summary = transcript.getByRole("region", {
    name: "Summary of the branch up to here",
  });
  await expect(summary).toContainText("PostgreSQL suits many writers.");
  // Rendered as Markdown, like any model output.
  await expect(summary.locator("strong")).toHaveText("many writers");
  // The whole branch went as one transcript, with the summary instruction
  // in place of the user's system prompt.
  const request = sent.at(-1) ?? [];
  expect(request[0]?.role).toBe("system");
  expect(request[0]?.content).toContain("You summarise conversations");
  expect(request.slice(1)).toEqual([
    {
      role: "user",
      content:
        '<turn role="user">\nWhich database?\n</turn>\n\n' +
        '<turn role="assistant">\nAnswer to: Which database?\n</turn>\n\n' +
        '<turn role="user">\nTell me about PostgreSQL\n</turn>\n\n' +
        '<turn role="assistant">\nAnswer to: Tell me about PostgreSQL\n</turn>',
    },
  ]);

  // An edit is saved as a new version.
  await summary.getByRole("button", { name: "Edit" }).click();
  await page
    .getByLabel("Summary", { exact: true })
    .fill("PostgreSQL suits many writers; SQLite was not discussed.");
  await page.getByRole("button", { name: "Save summary" }).click();
  await expect(summary).toContainText("SQLite was not discussed.");
  await expect(summary).toContainText("written by you");
  await expect(
    transcript.getByRole("region", { name: /^Summary/ }),
  ).toHaveCount(1);

  // Another branch from the first answer gets the summary instead of the
  // PostgreSQL exchange itself. While the new message is being written,
  // the PostgreSQL branch can be shown to attach its summary.
  await map
    .locator(".map-node-assistant", { hasText: "Answer to: Which database?" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Branch from here" }).click();
  await map
    .locator(".map-node-assistant", {
      hasText: "Answer to: Tell me about PostgreSQL",
    })
    .click();
  await summary.getByRole("button", { name: "Attach to your message" }).click();
  await expect(
    summary.getByRole("button", { name: "Attach to your message" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("region", { name: "Attached to your message" }),
  ).toContainText("Summary: PostgreSQL suits many writers");

  await input.fill("And SQLite?");
  await input.press("Control+Enter");
  await expect.poll(() => sent.length).toBe(4);
  expect(sent.at(-1)?.map((m) => m.content)).toEqual([
    "Which database?",
    "Answer to: Which database?",
    expect.stringMatching(
      /^<context source="summary" node="[^"]+">\nPostgreSQL suits many writers; SQLite was not discussed\.\n<\/context>\n\nAnd SQLite\?$/,
    ),
  ]);
  // The summary is listed on the message it was attached to.
  await expect(
    transcript
      .getByRole("listitem", { name: "Your message" })
      .filter({ hasText: "And SQLite?" }),
  ).toContainText("Summary: PostgreSQL suits many writers");
});
