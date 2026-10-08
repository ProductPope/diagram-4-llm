import { expect, test } from "@playwright/test";

import { answerEveryRequest, ENDPOINT, type SentMessage } from "./support";

test("titles answers on the map with the model chosen for titles", async ({
  page,
}) => {
  const sent: SentMessage[][] = [];
  await page.route(ENDPOINT, (route) =>
    answerEveryRequest(route, sent, (model, lastMessage) =>
      model === "title-model"
        ? `"Title of ${lastMessage}."`
        : `Answer to: ${lastMessage}`,
    ),
  );
  await page.goto("/#/app");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel(/^Models/).fill("test-model");
  await page.getByLabel("Model for node titles (optional)").fill("title-model");
  await page.getByRole("button", { name: "Save" }).click();

  const input = page.getByLabel("Message", { exact: true });
  await input.fill("Which database?");
  await input.press("Control+Enter");

  const map = page.getByRole("region", { name: "Conversation map" });
  // The title replaces the start of the answer; quotes and the full stop
  // the model added are removed.
  await expect(map.locator(".map-node-assistant .map-node-label")).toHaveText(
    "Title of Answer to: Which database?",
  );
  // The user's message keeps showing its start.
  await expect(map.locator(".map-node-user .map-node-label")).toHaveText(
    "Which database?",
  );
  // The title request carries only the answer, not the conversation.
  expect(sent).toHaveLength(2);
  expect(sent.at(-1)?.filter((message) => message.role !== "system")).toEqual([
    { role: "user", content: "Answer to: Which database?" },
  ]);
  // The reading pane still shows the full answer.
  await expect(
    page
      .getByRole("list", { name: "Selected branch" })
      .getByText("Answer to: Which database?"),
  ).toBeVisible();
});

test("shows the start of the answer when no title model is set", async ({
  page,
}) => {
  const sent: SentMessage[][] = [];
  await page.route(ENDPOINT, (route) => answerEveryRequest(route, sent));
  await page.goto("/#/app");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel(/^Models/).fill("test-model");
  await page.getByRole("button", { name: "Save" }).click();

  const input = page.getByLabel("Message", { exact: true });
  await input.fill("Which database?");
  await input.press("Control+Enter");

  await expect(
    page
      .getByRole("region", { name: "Conversation map" })
      .locator(".map-node-assistant .map-node-label"),
  ).toHaveText("Answer to: Which database?");
  expect(sent).toHaveLength(1);
});
