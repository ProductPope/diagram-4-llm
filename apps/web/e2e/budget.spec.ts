import { expect, test } from "@playwright/test";

import { answerEveryRequest, ENDPOINT, type SentMessage } from "./support";

test("blocks a context larger than the model's window and suggests what to do", async ({
  page,
}) => {
  const sent: SentMessage[][] = [];
  await page.route(ENDPOINT, (route) =>
    answerEveryRequest(route, sent, (_, last) =>
      last.startsWith("<turn") ? "Short summary." : "x".repeat(400),
    ),
  );
  await page.goto("/#/app");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel(/^Models/).fill("small-model");
  await page.getByLabel("small-model").fill("120");
  await page.getByRole("button", { name: "Save" }).click();

  const input = page.getByLabel("Message", { exact: true });
  const send = page.getByRole("button", { name: "Send" });
  await input.fill("First question");
  await input.press("Control+Enter");
  await expect.poll(() => sent.length).toBe(1);

  // About 100 tokens for the answer plus the new question: close to 120.
  await input.fill("Second question");
  await expect(
    page.getByText(/leaving little room for the answer/),
  ).toBeVisible();
  await expect(send).toBeEnabled();

  // Over the window: blocked, and nothing was sent or shortened.
  await input.fill(`Second question ${"y".repeat(200)}`);
  await expect(
    page.getByText(/more than the 120-token context window of small-model/),
  ).toBeVisible();
  await expect(send).toBeDisabled();
  await expect(
    page.getByText("The context is larger than the model's context window."),
  ).toBeVisible();
  expect(sent).toHaveLength(1);

  // Continuing from a summary keeps the message and replaces the branch
  // with its summary in a new first message.
  await input.fill("Second question");
  await page
    .getByRole("button", { name: "Continue from a summary of this branch" })
    .click();
  await expect(
    page.getByRole("region", { name: "Attached to your message" }),
  ).toContainText("Summary: Short summary.");
  await expect(input).toHaveValue("Second question");
  await expect(page.getByText(/leaving little room/)).toHaveCount(0);
  await input.press("Control+Enter");
  await expect.poll(() => sent.length).toBe(3);
  expect(sent.at(-1)?.map((m) => m.content)).toEqual([
    expect.stringMatching(
      /^<context source="summary" node="[^"]+">\nShort summary\.\n<\/context>\n\nSecond question$/,
    ),
  ]);
});
