import { expect, test, type Route } from "@playwright/test";

// The app talks to an OpenAI-compatible server, as a local Ollama would be.
// Playwright answers in its place, so the test needs no model or network.
const ENDPOINT = "http://localhost:11434/v1/chat/completions";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "POST, OPTIONS",
};

interface SentMessage {
  role: string;
  content: string;
}

function streamedAnswer(text: string): string {
  const chunk = (delta: object, finishReason: string | null) =>
    `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`;
  return (
    chunk({ content: text }, null) + chunk({}, "stop") + "data: [DONE]\n\n"
  );
}

async function answerEveryRequest(route: Route, sent: SentMessage[][]) {
  const request = route.request();
  if (request.method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: CORS });
    return;
  }
  const body = request.postDataJSON() as { messages: SentMessage[] };
  sent.push(body.messages);
  const question = body.messages.at(-1)?.content ?? "";
  await route.fulfill({
    status: 200,
    headers: { ...CORS, "content-type": "text/event-stream" },
    body: streamedAnswer(`Answer to: ${question}`),
  });
}

test("branches a conversation, sends only the branch's context, and keeps it after reload", async ({
  page,
}) => {
  const sent: SentMessage[][] = [];
  await page.route(ENDPOINT, (route) => answerEveryRequest(route, sent));
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Model").fill("test-model");
  await page.getByRole("button", { name: "Save" }).click();

  const input = page.getByLabel("Message", { exact: true });
  const userMessages = page.getByRole("listitem", { name: "Your message" });

  await input.fill("Which database?");
  await input.press("Control+Enter");
  await expect(page.getByText("Answer to: Which database?")).toBeVisible();

  await input.fill("Tell me about PostgreSQL");
  await page.getByText(/^Context: 3 messages/).click();
  await expect(page.locator(".inspector pre").last()).toHaveText(
    "Tell me about PostgreSQL",
  );
  await input.press("Control+Enter");
  await expect(
    page.getByText("Answer to: Tell me about PostgreSQL"),
  ).toBeVisible();

  // Editing the second message forks the conversation at the first answer.
  await userMessages.nth(1).getByRole("button", { name: "Edit" }).click();
  await input.fill("Tell me about SQLite");
  await input.press("Control+Enter");
  await expect(page.getByText("Answer to: Tell me about SQLite")).toBeVisible();
  await expect(
    page.getByText("Answer to: Tell me about PostgreSQL"),
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
    page.getByText("Answer to: Tell me about PostgreSQL"),
  ).toBeVisible();

  const savedConversation = page
    .getByRole("navigation", { name: "Conversations" })
    .getByRole("button", { name: "Which database?" });
  await expect(savedConversation).toBeVisible();
  await page.reload();
  await savedConversation.click();
  await expect(page.getByText("Answer to: Which database?")).toBeVisible();
  await expect(page.getByText("Answer to: Tell me about SQLite")).toBeVisible();
});

test("asks for a provider before sending", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText("Configure a provider in Settings before sending."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
});
