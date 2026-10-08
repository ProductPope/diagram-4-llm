import { expect, test } from "@playwright/test";

import { answerEveryRequest, ENDPOINT, type SentMessage } from "./support";

test("suggests branches under an answer and sends nothing until one is chosen", async ({
  page,
}) => {
  const sent: SentMessage[][] = [];
  await page.route(ENDPOINT, (route) =>
    answerEveryRequest(route, sent, (model, last) =>
      model === "suggester"
        ? "1. Why not PostgreSQL?\n2. How do I back it up?\n3. Is it fast enough?"
        : `Answer to: ${last}`,
    ),
  );
  await page.goto("/#/app");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel(/^Models/).fill("test-model");
  await page
    .getByLabel("Model for suggested branches (optional)")
    .fill("suggester");
  await page.getByRole("button", { name: "Save" }).click();

  const input = page.getByLabel("Message", { exact: true });
  const transcript = page.getByRole("list", { name: "Selected branch" });
  const map = page.getByRole("region", { name: "Conversation map" });
  await input.fill("Which database?");
  await input.press("Control+Enter");

  const suggested = transcript.getByRole("region", {
    name: "Suggested branches",
  });
  await expect(
    suggested.getByRole("button", { name: "Why not PostgreSQL?" }),
  ).toBeVisible();
  // One answer and one suggestion request, which held only the exchange.
  expect(sent).toHaveLength(2);
  expect(sent[1]?.at(-1)?.content).toBe(
    "Question:\nWhich database?\n\nAnswer:\nAnswer to: Which database?",
  );

  // Choosing one puts it in the composer as a branch; nothing is sent.
  await suggested.getByRole("button", { name: "Why not PostgreSQL?" }).click();
  await expect(input).toHaveValue("Why not PostgreSQL?");
  await expect(
    page.getByText("New branch from the selected answer."),
  ).toBeVisible();
  expect(sent).toHaveLength(2);
  await page.getByRole("button", { name: "Cancel branch" }).click();

  // Several at once only after the combined cost is shown.
  await suggested.getByLabel("Select “How do I back it up?”").check();
  await suggested.getByLabel("Select “Is it fast enough?”").check();
  await suggested
    .getByRole("button", { name: "Send 2 selected as branches…" })
    .click();
  await expect(
    suggested.getByText(
      /Sends 2 messages, each as its own branch from this answer: about \d+ input tokens in total \(estimate\)\./,
    ),
  ).toBeVisible();
  expect(sent).toHaveLength(2);
  await suggested.getByRole("button", { name: "Send 2 messages" }).click();

  await expect(map.locator(".map-node-user")).toHaveCount(3);
  const answers = () =>
    sent.filter(
      (request) => request.at(-1)?.content.startsWith("Question:") !== true,
    );
  await expect.poll(() => answers().length).toBe(3);
  expect(answers().map((request) => request.map((m) => m.content))).toEqual([
    ["Which database?"],
    ["Which database?", "Answer to: Which database?", "How do I back it up?"],
    ["Which database?", "Answer to: Which database?", "Is it fast enough?"],
  ]);
});
