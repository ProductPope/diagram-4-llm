import { expect, test } from "@playwright/test";

import {
  answerEveryRequest,
  configureProvider,
  ENDPOINT,
  type SentMessage,
} from "./support";

test("answers the same question with two models and keeps each branch's model", async ({
  page,
}) => {
  const models: string[] = [];
  const sent: SentMessage[][] = [];
  await page.route(ENDPOINT, async (route) => {
    if (route.request().method() === "POST") {
      models.push((route.request().postDataJSON() as { model: string }).model);
    }
    await answerEveryRequest(route, sent);
  });
  await page.goto("/#/app");
  await configureProvider(page, ["model-a", "model-b"]);

  const input = page.getByLabel("Message", { exact: true });
  const transcript = page.getByRole("list", { name: "Selected branch" });
  const modelChoice = page.getByLabel("Model for the next answer");

  await expect(modelChoice).toHaveValue("model-a");
  await input.fill("Which database?");
  await input.press("Control+Enter");
  await expect(
    transcript.getByText("Answer to: Which database?"),
  ).toBeVisible();

  await modelChoice.selectOption("model-b");
  await transcript.getByRole("button", { name: "Regenerate" }).click();
  const answer = transcript.getByRole("listitem", { name: "Answer" });
  await expect(answer.getByText("model-b")).toBeVisible();
  await expect(answer.getByText("2 / 2")).toBeVisible();
  expect(models).toEqual(["model-a", "model-b"]);

  // The first version still shows the model that wrote it.
  await answer.getByRole("button", { name: "Previous version" }).click();
  await expect(answer.getByText("model-a")).toBeVisible();
});
