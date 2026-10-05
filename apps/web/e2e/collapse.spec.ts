import { expect, test } from "@playwright/test";

import {
  answerEveryRequest,
  configureProvider,
  ENDPOINT,
  type SentMessage,
} from "./support";

test("collapses a subtree on the map and keeps it collapsed after reload", async ({
  page,
}) => {
  const sent: SentMessage[][] = [];
  await page.route(ENDPOINT, (route) => answerEveryRequest(route, sent));
  await page.goto("/");
  await configureProvider(page);

  const input = page.getByLabel("Message", { exact: true });
  const transcript = page.getByRole("list", { name: "Selected branch" });
  const map = page.getByRole("region", { name: "Conversation map" });
  for (const question of ["First question", "Second question"]) {
    await input.fill(question);
    await input.press("Control+Enter");
    await expect(transcript.getByText(`Answer to: ${question}`)).toBeVisible();
  }
  await expect(map.locator(".map-node")).toHaveCount(4);

  // The first answer has one reply below it, which in turn has an answer.
  const firstAnswer = map.locator(".react-flow__node", {
    hasText: "Answer to: First question",
  });
  await firstAnswer.getByRole("button", { name: "Collapse replies" }).click();
  await expect(map.locator(".map-node")).toHaveCount(2);
  const expand = firstAnswer.getByRole("button", {
    name: "Expand 2 hidden turns",
  });
  await expect(expand).toHaveText("+2");
  // Collapsing changes only the map, not the branch being read.
  await expect(
    transcript.getByText("Answer to: Second question"),
  ).toBeVisible();

  await expect(
    page.getByRole("status").filter({ hasText: "All changes saved" }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("navigation", { name: "Conversations" })
    .getByRole("button", { name: "First question" })
    .click();
  await expect(map.locator(".map-node")).toHaveCount(2);

  await expand.click();
  await expect(map.locator(".map-node")).toHaveCount(4);
});
