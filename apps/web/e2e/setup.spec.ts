import { expect, test, type Route } from "@playwright/test";

import { answerEveryRequest, ENDPOINT, type SentMessage } from "./support";

const OLLAMA_MODELS = "http://localhost:11434/v1/models";
const ANTHROPIC_MODELS = "https://api.anthropic.com/v1/models*";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

async function fulfillJson(route: Route, status: number, body: unknown) {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: CORS });
    return;
  }
  await route.fulfill({
    status,
    headers: { ...CORS, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("sets up a local model from the models the server offers, then chats", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const sent: SentMessage[][] = [];
  await page.route(OLLAMA_MODELS, (route) =>
    fulfillJson(route, 200, {
      object: "list",
      data: [
        { id: "llama3.2", object: "model", created: 1, owned_by: "library" },
        { id: "qwen3", object: "model", created: 2, owned_by: "library" },
      ],
    }),
  );
  await page.route(ENDPOINT, (route) => answerEveryRequest(route, sent));
  await page.goto("/");

  // New visitors land on the welcome page and start setup from there.
  await page.getByLabel("Next question").click();
  await page.getByRole("button", { name: "Connect a model" }).click();
  await expect(
    page.getByRole("heading", { name: "Where should answers come from?" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /^Ollama/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  // The instructions name this page's origin, which Ollama must allow.
  const origin = new URL(page.url()).origin;
  await expect(page.getByText(origin).first()).toBeVisible();
  await expect(page.getByLabel("Server URL")).toHaveValue(
    "http://localhost:11434/v1",
  );
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByText("2 models are available.")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // The first model is chosen for you; add the second.
  await expect(page.getByRole("checkbox", { name: "llama3.2" })).toBeChecked();
  await page.getByRole("checkbox", { name: "qwen3" }).check();
  await expect(page.getByLabel("Titles on the map")).toHaveValue("");
  await page.getByRole("button", { name: "Start chatting" }).click();

  const input = page.getByLabel("Message", { exact: true });
  await input.fill("Hello");
  await input.press("Control+Enter");
  await expect(
    page
      .getByRole("list", { name: "Selected branch" })
      .getByText("Answer to: Hello"),
  ).toBeVisible();
  await expect(page.getByLabel("Model for the next answer")).toHaveValue(
    "llama3.2",
  );
  expect(consoleErrors).toEqual([]);
});

test("explains an unreachable server and allows continuing without a test", async ({
  page,
}) => {
  await page.route(OLLAMA_MODELS, (route) => route.abort("failed"));
  await page.goto("/");
  await page.getByLabel("Next question").click();
  await page.getByRole("button", { name: "Connect a model" }).click();
  await page.getByRole("radio", { name: /^Ollama/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Test connection" }).click();

  await expect(page.getByText("The connection did not work")).toBeVisible();
  await expect(
    page.getByText(/Check that it is running and that it allows this page/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Continue without testing" }).click();
  const start = page.getByRole("button", { name: "Start chatting" });
  await expect(start).toBeDisabled();
  await page.getByLabel("Model IDs (one per line)").fill("llama3.2");
  await start.click();
  await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
});

test("tells the user when Anthropic rejects the key", async ({ page }) => {
  let attempts = 0;
  await page.route(ANTHROPIC_MODELS, async (route) => {
    if (route.request().method() !== "OPTIONS") attempts += 1;
    await (attempts <= 1
      ? fulfillJson(route, 401, {
          type: "error",
          error: { type: "authentication_error", message: "invalid x-api-key" },
        })
      : fulfillJson(route, 200, {
          data: [
            {
              type: "model",
              id: "claude-sonnet-5-5",
              display_name: "Claude Sonnet 5.5",
              created_at: "2026-01-01T00:00:00Z",
            },
          ],
          has_more: false,
          first_id: "claude-sonnet-5-5",
          last_id: "claude-sonnet-5-5",
        }));
  });
  await page.goto("/");
  await page.getByLabel("Next question").click();
  await page.getByRole("button", { name: "Connect a model" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  const key = page.getByLabel("API key");
  await key.fill("sk-ant-wrong");
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(
    page.getByText("Anthropic did not accept this key."),
  ).toBeVisible();

  await key.fill("sk-ant-right");
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByText("1 model is available.")).toBeVisible();
});
