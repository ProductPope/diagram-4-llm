import { expect, test } from "@playwright/test";

import {
  answerEveryRequest,
  configureProvider,
  ENDPOINT,
  type SentMessage,
} from "./support";

/** A short session in the shape Claude Code 2.1.294 writes. */
function transcript(): string {
  const prompt = (uuid: string, parentUuid: string | null, text: string) => ({
    type: "user",
    uuid,
    parentUuid,
    message: { role: "user", content: text },
  });
  const answer = (
    uuid: string,
    parentUuid: string,
    response: string,
    block: unknown,
  ) => ({
    type: "assistant",
    uuid,
    parentUuid,
    message: {
      id: response,
      model: "claude-test",
      role: "assistant",
      content: [block],
    },
  });
  const lines = [
    { type: "ai-title", aiTitle: "Fix the failing build" },
    prompt("p1", null, "The build fails"),
    answer("a1", "p1", "r1", {
      type: "tool_use",
      id: "t1",
      name: "Bash",
      input: { command: "pnpm build" },
    }),
    {
      type: "user",
      uuid: "u1",
      parentUuid: "a1",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "t1",
            content: "error TS2322",
            is_error: true,
          },
        ],
      },
    },
    answer("a2", "u1", "r2", {
      type: "text",
      text: "A **type error** in `main.ts`.",
    }),
    prompt("p2", "a2", "Fix it"),
    answer("a3", "p2", "r3", { type: "text", text: "Fixed." }),
    prompt("p3", "a2", "Explain it instead"),
    answer("a4", "p3", "r4", { type: "text", text: "It is a mismatch." }),
    {
      type: "attachment",
      uuid: "x1",
      parentUuid: "a4",
      attachment: { type: "total_tokens_reminder" },
    },
    "{ not json",
  ];
  return lines
    .map((line) => (typeof line === "string" ? line : JSON.stringify(line)))
    .join("\n");
}

test("maps a Claude Code session transcript, read-only", async ({ page }) => {
  await page.goto("/#/app");
  await page.getByRole("button", { name: "Map a Claude Code session" }).click();
  await expect(page).toHaveURL(/#\/session$/);

  await page.getByLabel("Open a session transcript").setInputFiles({
    name: "session.jsonl",
    mimeType: "application/jsonl",
    buffer: Buffer.from(transcript()),
  });

  await expect(
    page.getByRole("heading", { name: "Fix the failing build" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "1 line could not be read and is not on the map. The first, line 11",
  );
  await expect(
    page.getByText("Lines not on the map, by type: attachment 1."),
  ).toBeVisible();

  // The latest branch is shown first; the tool call carries its result.
  const branch = page.getByRole("list", { name: "Selected branch" });
  await expect(branch.getByText("Explain it instead")).toBeVisible();
  await expect(branch.getByText("It is a mismatch.")).toBeVisible();
  await expect(branch.getByText("Fixed.")).toHaveCount(0);
  await branch.getByText("Bash · failed").click();
  await expect(branch.getByText('"command": "pnpm build"')).toBeVisible();
  await expect(branch.getByText("error TS2322")).toBeVisible();
  // Answers are rendered Markdown.
  await expect(
    branch.locator("strong", { hasText: "type error" }),
  ).toBeVisible();

  // Both prompts sent after the same answer are on the map; moving to the
  // other one with the keyboard and choosing it shows its branch.
  const map = page.getByRole("region", { name: "Session map" });
  await expect(map.locator(".map-node")).toHaveCount(6);
  const explain = map.getByRole("button", { name: /Explain it instead/ });
  await explain.focus();
  await page.keyboard.press("ArrowLeft");
  const fix = map.getByRole("button", { name: /Fix it/ });
  await expect(fix).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(branch.getByText("Fixed.")).toBeVisible();
  await expect(branch.getByText("Explain it instead")).toHaveCount(0);

  // Nothing was stored: the conversations list is unchanged.
  await page.getByRole("button", { name: "Back to conversations" }).click();
  await expect(page.getByText("No conversations yet.")).toBeVisible();
});

test("explains a file that is not a session transcript", async ({ page }) => {
  await page.goto("/#/session");
  await page.getByLabel("Open a session transcript").setInputFiles({
    name: "notes.jsonl",
    mimeType: "application/jsonl",
    buffer: Buffer.from('{"name": "not a session"}\n'),
  });
  await expect(page.getByRole("alert")).toContainText(
    "notes.jsonl could not be opened: The file is not a Claude Code session transcript: line 1: The line has no type.",
  );
});

test("divides the selected branch into topics on request", async ({ page }) => {
  const sent: SentMessage[][] = [];
  await page.route(ENDPOINT, (route) =>
    answerEveryRequest(
      route,
      sent,
      () => "Topics:\n1: Failing build\n2: Why it failed",
    ),
  );
  await page.goto("/#/app");
  await configureProvider(page);
  await page.getByRole("button", { name: "Map a Claude Code session" }).click();
  await page.getByLabel("Open a session transcript").setInputFiles({
    name: "session.jsonl",
    mimeType: "application/jsonl",
    buffer: Buffer.from(transcript()),
  });

  const topics = page.getByRole("region", { name: "Topics" });
  await expect(
    topics.getByText(
      "Sends the start of each prompt on this branch to test-model.",
    ),
  ).toBeVisible();
  expect(sent).toHaveLength(0);
  await topics.getByRole("button", { name: "Detect topics" }).click();

  // Only the prompts of the selected branch were sent, numbered.
  const branch = page.getByRole("list", { name: "Selected branch" });
  await expect(
    branch.getByRole("heading", { name: "Why it failed" }),
  ).toBeVisible();
  await expect(
    branch.getByRole("heading", { name: "Failing build" }),
  ).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]?.at(-1)?.content).toBe(
    "1. The build fails\n2. Explain it instead",
  );
  await expect(
    topics.getByRole("button", { name: "Why it failed" }),
  ).toBeVisible();
  await expect(
    topics.getByRole("button", { name: "Detect topics again" }),
  ).toBeEnabled();
});

test("asks for a provider before topics can be detected", async ({ page }) => {
  await page.goto("/#/session");
  await page.getByLabel("Open a session transcript").setInputFiles({
    name: "session.jsonl",
    mimeType: "application/jsonl",
    buffer: Buffer.from(transcript()),
  });
  await expect(
    page.getByText("Set up a provider to divide this session into topics."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Detect topics" })).toHaveCount(
    0,
  );
});
