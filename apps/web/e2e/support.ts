import type { Page, Route } from "@playwright/test";

// The app talks to an OpenAI-compatible server, as a local Ollama would be.
// Playwright answers in its place, so the test needs no model or network.
export const ENDPOINT = "http://localhost:11434/v1/chat/completions";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "POST, OPTIONS",
};

export interface SentMessage {
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

/** Answers each request with the text `reply` gives for the model and the last message. */
export async function answerEveryRequest(
  route: Route,
  sent: SentMessage[][],
  reply: (model: string, lastMessage: string) => string = (_, question) =>
    `Answer to: ${question}`,
) {
  const request = route.request();
  if (request.method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: CORS });
    return;
  }
  const body = request.postDataJSON() as {
    model: string;
    messages: SentMessage[];
  };
  sent.push(body.messages);
  const lastMessage = body.messages.at(-1)?.content ?? "";
  await route.fulfill({
    status: 200,
    headers: { ...CORS, "content-type": "text/event-stream" },
    body: streamedAnswer(reply(body.model, lastMessage)),
  });
}

/** Points the app at the fake server and saves the settings. */
export async function configureProvider(
  page: Page,
  models = ["test-model"],
): Promise<void> {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel(/^Models/).fill(models.join("\n"));
  await page.getByRole("button", { name: "Save" }).click();
}
